import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PAYPAL-WEBHOOK] ${step}${detailsStr}`);
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
    throw new Error("Failed to get PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
};

const verifyWebhookSignature = async (
  req: Request, 
  body: string, 
  accessToken: string
): Promise<boolean> => {
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
  
  // If no webhook ID configured, skip verification (for development)
  if (!webhookId) {
    logStep("No webhook ID configured, skipping verification");
    return true;
  }

  const baseUrl = getPayPalBaseUrl();
  
  const verifyPayload = {
    auth_algo: req.headers.get("paypal-auth-algo"),
    cert_url: req.headers.get("paypal-cert-url"),
    transmission_id: req.headers.get("paypal-transmission-id"),
    transmission_sig: req.headers.get("paypal-transmission-sig"),
    transmission_time: req.headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  };

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verifyPayload),
  });

  if (!response.ok) {
    logStep("Webhook verification failed", { status: response.status });
    return false;
  }

  const data = await response.json();
  return data.verification_status === "SUCCESS";
};

serve(async (req) => {
  try {
    logStep("Webhook received");

    const body = await req.text();
    const event = JSON.parse(body);

    logStep("Event type", { type: event.event_type });

    const accessToken = await getPayPalAccessToken();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, body, accessToken);
    if (!isValid) {
      logStep("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    logStep("Webhook verified");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    if (event.event_type === "CHECKOUT.ORDER.APPROVED" || 
        event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      
      const orderId = event.resource?.id || event.resource?.supplementary_data?.related_ids?.order_id;
      
      if (!orderId) {
        logStep("No order ID in event");
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      logStep("Processing order", { orderId });

      // Check if already processed
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id, status, paypal_capture_id, user_id, amount")
        .eq("paypal_order_id", orderId)
        .maybeSingle();

      if (!existingTx) {
        logStep("No pending transaction found for order", { orderId });
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      if (existingTx.status === "completed" && existingTx.paypal_capture_id) {
        logStep("Order already completed", { transactionId: existingTx.id });
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // For CAPTURE.COMPLETED, the capture ID is in the resource
      const captureId = event.resource?.id || "webhook-capture";
      const amount = existingTx.amount;

      // Update transaction
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          paypal_capture_id: captureId,
          description: `Purchased ${amount} Coins via PayPal`,
        })
        .eq("id", existingTx.id);

      // Update wallet
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", existingTx.user_id)
        .single();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({ balance: (wallet.balance || 0) + amount })
          .eq("user_id", existingTx.user_id);

        logStep("Wallet updated via webhook", { userId: existingTx.user_id, amount });
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
