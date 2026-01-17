import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    console.error("Missing signature or webhook secret");
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
    console.error("Webhook signature verification failed:", errorMessage);
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  console.log("Received Stripe event:", event.type);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    console.log("Checkout session completed:", session.id);
    console.log("Metadata:", session.metadata);

    const userId = session.metadata?.user_id;
    const coins = parseFloat(session.metadata?.coins || "0");

    if (!userId || !coins) {
      console.error("Missing user_id or coins in metadata");
      return new Response("Missing metadata", { status: 400 });
    }

    // Check for idempotency - see if we already processed this session
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingTx) {
      console.log("Transaction already processed, skipping");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    console.log("Processing deposit for user:", userId, "coins:", coins);

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      console.error("Error fetching wallet:", walletError);
      return new Response("Error fetching wallet", { status: 500 });
    }

    // Update wallet balance
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: wallet.balance + coins })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating wallet:", updateError);
      return new Response("Error updating wallet", { status: 500 });
    }

    console.log("Wallet updated successfully");

    // Create transaction record
    const { error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "deposit",
        amount: coins,
        description: `Purchased ${coins} Coins`,
        stripe_session_id: session.id,
        status: "completed",
      });

    if (txError) {
      console.error("Error creating transaction:", txError);
      return new Response("Error creating transaction", { status: 500 });
    }

    console.log("Transaction record created successfully");
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
