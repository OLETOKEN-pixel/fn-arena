import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PAYPAL-ORDER] ${step}${detailsStr}`);
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
    logStep("Function started");

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

    logStep("User authenticated", { userId: user.id });

    const { amount } = await req.json();
    
    if (!amount || amount < 1) {
      return new Response(
        JSON.stringify({ error: "Invalid amount. Minimum is 1 Coin (€1)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Creating PayPal order for amount", { amount });

    const accessToken = await getPayPalAccessToken();
    logStep("Got PayPal access token");

    const origin = req.headers.get("origin") || "https://lovable.dev";
    const baseUrl = getPayPalBaseUrl();

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "EUR",
            value: amount.toFixed(2),
          },
          description: `${amount} OLEBOY TOKEN Coins`,
          custom_id: user.id,
        },
      ],
      application_context: {
        brand_name: "OLEBOY TOKEN",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${origin}/payment/success?provider=paypal`,
        cancel_url: `${origin}/buy?canceled=true`,
      },
    };

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      logStep("Order creation error", { status: orderResponse.status, error: errorText });
      throw new Error("Failed to create PayPal order");
    }

    const orderData = await orderResponse.json();
    logStep("PayPal order created", { orderId: orderData.id });

    // Find approval URL
    const approvalUrl = orderData.links?.find((link: { rel: string }) => link.rel === "approve")?.href;

    if (!approvalUrl) {
      throw new Error("No approval URL in PayPal response");
    }

    // Store pending transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "deposit",
      amount: amount,
      description: `Purchasing ${amount} Coins via PayPal`,
      provider: "paypal",
      paypal_order_id: orderData.id,
      status: "pending",
    });

    logStep("Pending transaction stored", { orderId: orderData.id });

    return new Response(
      JSON.stringify({ 
        orderId: orderData.id, 
        approvalUrl: `${approvalUrl}&orderId=${orderData.id}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
