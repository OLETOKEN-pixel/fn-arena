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
  
  // CRITICAL: In production, webhook verification is REQUIRED
  if (!webhookId) {
    const mode = Deno.env.get("PAYPAL_MODE") || "sandbox";
    if (mode === "live") {
      logStep("CRITICAL: No PAYPAL_WEBHOOK_ID configured in LIVE mode - rejecting webhook");
      return false;
    }
    logStep("WARNING: No PAYPAL_WEBHOOK_ID configured - skipping verification (sandbox only)");
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

  logStep("Verifying webhook signature", { 
    transmissionId: verifyPayload.transmission_id,
    webhookId: webhookId 
  });

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verifyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logStep("Webhook verification API error", { status: response.status, error: errorText });
    return false;
  }

  const data = await response.json();
  logStep("Verification result", { status: data.verification_status });
  return data.verification_status === "SUCCESS";
};

serve(async (req) => {
  try {
    logStep("Webhook received");
    
    const mode = Deno.env.get("PAYPAL_MODE") || "sandbox";
    logStep(`Mode: ${mode === "live" ? "LIVE" : "SANDBOX"}`);

    const body = await req.text();
    const event = JSON.parse(body);

    logStep("Event received", { type: event.event_type, id: event.id });

    const accessToken = await getPayPalAccessToken();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, body, accessToken);
    if (!isValid) {
      logStep("Invalid webhook signature - rejecting");
      return new Response("Invalid signature", { status: 401 });
    }

    logStep("Webhook verified successfully");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED
    if (event.event_type === "CHECKOUT.ORDER.APPROVED" || 
        event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      
      const orderId = event.resource?.id || event.resource?.supplementary_data?.related_ids?.order_id;
      
      if (!orderId) {
        logStep("No order ID in event");
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      logStep("Processing order", { orderId, eventType: event.event_type });

      // Check if already processed (idempotency)
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
        const newBalance = (wallet.balance || 0) + amount;
        await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("user_id", existingTx.user_id);

        logStep("Wallet updated via webhook", { 
          userId: existingTx.user_id, 
          previousBalance: wallet.balance,
          newBalance,
          coinsAdded: amount 
        });
      }

      logStep("Order processed successfully", { orderId, amount, captureId });
    }

    // Handle PAYMENT.CAPTURE.REFUNDED
    if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const captureId = event.resource?.id;
      const refundAmount = parseFloat(event.resource?.amount?.value || "0");

      logStep("Processing refund", { captureId, refundAmount });

      if (!captureId || refundAmount <= 0) {
        logStep("Invalid refund data");
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Find the original transaction
      const { data: originalTx } = await supabase
        .from("transactions")
        .select("id, user_id, amount")
        .eq("paypal_capture_id", captureId)
        .maybeSingle();

      if (!originalTx) {
        logStep("No transaction found for capture", { captureId });
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Check if refund already processed
      const { data: existingRefund } = await supabase
        .from("transactions")
        .select("id")
        .eq("paypal_order_id", `refund_${captureId}`)
        .maybeSingle();

      if (existingRefund) {
        logStep("Refund already processed", { transactionId: existingRefund.id });
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Deduct from wallet
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", originalTx.user_id)
        .single();

      if (wallet) {
        const newBalance = Math.max(0, (wallet.balance || 0) - refundAmount);
        await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("user_id", originalTx.user_id);

        logStep("Wallet debited for refund", { userId: originalTx.user_id, refundAmount, newBalance });
      }

      // Record refund transaction
      await supabase
        .from("transactions")
        .insert({
          user_id: originalTx.user_id,
          type: "refund",
          amount: -refundAmount,
          description: `Refund: ${refundAmount} Coins`,
          paypal_order_id: `refund_${captureId}`,
          provider: "paypal",
          status: "completed",
        });

      logStep("Refund transaction created", { captureId, refundAmount });
    }

    // Handle PAYMENT.CAPTURE.DENIED
    if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      
      logStep("Payment denied", { orderId });

      if (orderId) {
        // Mark transaction as failed
        await supabase
          .from("transactions")
          .update({
            status: "failed",
            description: "Payment denied by PayPal",
          })
          .eq("paypal_order_id", orderId);

        logStep("Transaction marked as failed", { orderId });
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
