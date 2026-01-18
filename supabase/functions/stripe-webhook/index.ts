import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    logStep("Missing signature or webhook secret");
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logStep("Webhook signature verification failed", { error: errorMessage });
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    logStep("Processing checkout.session.completed", { 
      sessionId: session.id,
      paymentStatus: session.payment_status,
      metadata: session.metadata 
    });

    const userId = session.metadata?.user_id;
    const coins = parseFloat(session.metadata?.coins || "0");

    if (!userId || !coins) {
      logStep("Missing user_id or coins in metadata", { userId, coins });
      return new Response("Missing metadata", { status: 400 });
    }

    // Idempotency check - see if we already processed this session
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingTx) {
      logStep("Transaction already processed, skipping", { transactionId: existingTx.id });
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    logStep("Processing deposit", { userId, coins });

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      logStep("Error fetching wallet", { error: walletError });
      return new Response("Error fetching wallet", { status: 500 });
    }

    // Update wallet balance
    const newBalance = (wallet.balance || 0) + coins;
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", userId);

    if (updateError) {
      logStep("Error updating wallet", { error: updateError });
      return new Response("Error updating wallet", { status: 500 });
    }

    logStep("Wallet updated", { userId, previousBalance: wallet.balance, newBalance, coinsAdded: coins });

    // Create transaction record
    const { error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "deposit",
        amount: coins,
        description: `Purchased ${coins} Coins via Stripe`,
        stripe_session_id: session.id,
        provider: "stripe",
        status: "completed",
      });

    if (txError) {
      logStep("Error creating transaction", { error: txError });
      return new Response("Error creating transaction", { status: 500 });
    }

    logStep("Transaction record created", { sessionId: session.id, coins });
  }

  // Handle charge.refunded
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    
    logStep("Processing charge.refunded", { 
      chargeId: charge.id,
      amount: charge.amount_refunded,
      paymentIntentId: charge.payment_intent
    });

    // Find the original transaction by looking up via payment intent
    // The checkout session has a payment_intent, and charges are linked to it
    const paymentIntentId = charge.payment_intent as string;
    
    if (!paymentIntentId) {
      logStep("No payment intent ID in charge");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Get the session associated with this payment intent
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });

    if (sessions.data.length === 0) {
      logStep("No session found for payment intent", { paymentIntentId });
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const session = sessions.data[0];
    const userId = session.metadata?.user_id;
    const refundedAmount = charge.amount_refunded / 100; // Convert from cents to EUR

    if (!userId) {
      logStep("No user_id in session metadata");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Check if refund already processed
    const { data: existingRefund } = await supabase
      .from("transactions")
      .select("id")
      .eq("stripe_session_id", `refund_${charge.id}`)
      .maybeSingle();

    if (existingRefund) {
      logStep("Refund already processed", { transactionId: existingRefund.id });
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Deduct from wallet
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (wallet) {
      const newBalance = Math.max(0, (wallet.balance || 0) - refundedAmount);
      await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", userId);

      logStep("Wallet debited for refund", { userId, refundedAmount, newBalance });
    }

    // Record refund transaction
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "refund",
        amount: -refundedAmount,
        description: `Refund: ${refundedAmount} Coins`,
        stripe_session_id: `refund_${charge.id}`,
        provider: "stripe",
        status: "completed",
      });

    logStep("Refund transaction created", { chargeId: charge.id, refundedAmount });
  }

  // Handle payment_intent.succeeded (optional, for logging)
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    logStep("Payment intent succeeded", { 
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
