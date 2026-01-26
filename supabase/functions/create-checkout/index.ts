import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const PROCESSING_FEE = 0.50; // Fixed €0.50 fee
const MIN_COINS = 5; // Minimum purchase 5 coins
const PRODUCTION_DOMAIN = "https://oleboytoken.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("CRITICAL: STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Payment system not configured. Contact support." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isLiveMode = stripeKey.startsWith("sk_live_");
    logStep(`Mode: ${isLiveMode ? "LIVE" : "TEST"}`);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header");
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

    const { amount } = await req.json();
    
    // Validation: minimum 5 coins
    if (!amount || amount < MIN_COINS) {
      logStep("Invalid amount", { amount, minRequired: MIN_COINS });
      return new Response(
        JSON.stringify({ error: `Minimo acquisto: ${MIN_COINS} Coins (€${MIN_COINS})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = req.headers.get("origin") || PRODUCTION_DOMAIN;
    const totalAmount = amount + PROCESSING_FEE;

    logStep("Creating checkout session", { 
      coins: amount, 
      fee: PROCESSING_FEE, 
      total: totalAmount,
      origin 
    });

    // Create Stripe checkout session
    // Using customer_email to prefill but allowing modification
    // NOT passing customer ID to allow email change
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email, // Prefill but editable
      // Enable card and PayPal (if configured in Stripe dashboard)
      payment_method_types: ["card", "paypal"],
      
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `${amount} Coins`,
              description: "OLEBOY TOKEN Gaming Coins",
            },
            unit_amount: Math.round(amount * 100), // Cents
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Commissione di servizio",
              description: "Processing fee",
            },
            unit_amount: Math.round(PROCESSING_FEE * 100), // 50 cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment/success?provider=stripe&success=true&coins=${amount}`,
      cancel_url: `${origin}/buy?canceled=true`,
      metadata: {
        user_id: user.id,
        coins: amount.toString(),
        fee: PROCESSING_FEE.toString(),
      },
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      mode: isLiveMode ? "LIVE" : "TEST",
      paymentMethods: ["card", "paypal"]
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
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
