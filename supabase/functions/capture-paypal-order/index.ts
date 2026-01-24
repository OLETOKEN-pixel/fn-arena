import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CAPTURE-PAYPAL-ORDER] ${step}${detailsStr}`);
};

const getPayPalBaseUrl = () => {
  const mode = Deno.env.get("PAYPAL_MODE") || "sandbox";
  return mode === "live" 
    ? "https://api-m.paypal.com" 
    : "https://api-m.sandbox.paypal.com";
};

const getPayPalAccessToken = async (): Promise<string> => {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = btoa(`${clientId}:${clientSecret}`);
  const baseUrl = getPayPalBaseUrl();
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    logStep("Token error", { status: response.status, error: errorText });
    throw new Error("Failed to get PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log mode and environment at startup
    const paypalMode = Deno.env.get("PAYPAL_MODE") || "sandbox";
    const isLiveMode = paypalMode === "live";
    const baseUrl = getPayPalBaseUrl();
    
    logStep("Function started", { 
      mode: isLiveMode ? "LIVE" : "SANDBOX",
      baseUrl,
      hasClientId: !!Deno.env.get("PAYPAL_CLIENT_ID"),
      hasClientSecret: !!Deno.env.get("PAYPAL_CLIENT_SECRET")
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No auth header");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logStep("Auth error", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body and extract orderId
    const body = await req.json();
    const orderId = body.orderId;
    
    logStep("Request body received", { orderId, rawBody: JSON.stringify(body) });
    
    if (!orderId) {
      logStep("Missing orderId in request");
      return new Response(
        JSON.stringify({ error: "Missing orderId", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Capturing PayPal order", { orderId, mode: isLiveMode ? "LIVE" : "SANDBOX" });

    // IDEMPOTENCY CHECK: See if this order was already captured
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id, status, paypal_capture_id")
      .eq("paypal_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingTx?.status === "completed" && existingTx?.paypal_capture_id) {
      logStep("Order already captured, returning success", { transactionId: existingTx.id });
      return new Response(
        JSON.stringify({ success: true, message: "Order already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getPayPalAccessToken();
    logStep("Got PayPal access token");

    // Use existing baseUrl from top of function

    // First get order details to verify it's ready for capture
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      logStep("Order fetch error", { status: orderResponse.status, error: errorText });
      throw new Error("Failed to fetch PayPal order");
    }

    const orderData = await orderResponse.json();
    logStep("Order status", { status: orderData.status });

    // If already captured, just update our records
    if (orderData.status === "COMPLETED") {
      logStep("Order already completed in PayPal");
      const captureId = orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id || "completed";
      const amount = parseFloat(orderData.purchase_units?.[0]?.amount?.value || "0");

      // Update transaction
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          paypal_capture_id: captureId,
        })
        .eq("paypal_order_id", orderId)
        .eq("user_id", user.id);

      // Update wallet
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({ balance: (wallet.balance || 0) + amount })
          .eq("user_id", user.id);
      }

      return new Response(
        JSON.stringify({ success: true, coins: amount }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Capture the order
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      logStep("Capture error", { status: captureResponse.status, error: errorText });
      throw new Error("Failed to capture PayPal order");
    }

    const captureData = await captureResponse.json();
    logStep("Capture response", { status: captureData.status });

    if (captureData.status !== "COMPLETED") {
      throw new Error(`Capture not completed: ${captureData.status}`);
    }

    const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const amount = parseFloat(captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || "0");

    logStep("Payment captured", { captureId, amount });

    // Update transaction to completed
    const { error: txUpdateError } = await supabase
      .from("transactions")
      .update({
        status: "completed",
        paypal_capture_id: captureId,
        description: `Purchased ${amount} Coins via PayPal`,
      })
      .eq("paypal_order_id", orderId)
      .eq("user_id", user.id);

    if (txUpdateError) {
      logStep("Transaction update error", txUpdateError);
    }

    // Update wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (walletError) {
      logStep("Wallet fetch error", walletError);
      throw new Error("Failed to fetch wallet");
    }

    const newBalance = (wallet.balance || 0) + amount;

    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", user.id);

    if (updateError) {
      logStep("Wallet update error", updateError);
      throw new Error("Failed to update wallet");
    }

    logStep("Wallet updated", { previousBalance: wallet.balance, newBalance, coinsAdded: amount });

    return new Response(
      JSON.stringify({ success: true, coins: amount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
