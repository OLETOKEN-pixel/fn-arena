import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-STRIPE-CONNECT] ${step}${detailsStr}`);
};

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
        JSON.stringify({ error: "Sistema pagamenti non configurato. Contatta il supporto." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify it's a valid secret key (sk_live_ or sk_test_)
    const keyPrefix = stripeKey.substring(0, 8);
    logStep("Key prefix check", { prefix: keyPrefix });

    if (!stripeKey.startsWith("sk_live_") && !stripeKey.startsWith("sk_test_")) {
      logStep("CRITICAL: Invalid key type", { 
        prefix: keyPrefix,
        expected: "sk_live_ or sk_test_",
        isRestricted: stripeKey.startsWith("rk_"),
        isPublishable: stripeKey.startsWith("pk_")
      });
      
      return new Response(
        JSON.stringify({ 
          error: "Configurazione Stripe non valida. Contatta il supporto.",
          code: "INVALID_KEY_TYPE"
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logStep("Auth error", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("User authenticated", { userId: user.id });

    // Check if account already exists
    const { data: existingAccount, error: fetchError } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      logStep("Error fetching existing account", fetchError);
    }

    let stripeAccountId: string;

    if (existingAccount?.stripe_account_id) {
      stripeAccountId = existingAccount.stripe_account_id;
      logStep("Using existing Stripe account", { stripeAccountId });
      
      // Check if onboarding is complete - if so, just return success
      if (existingAccount.payouts_enabled) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Account already verified",
            payouts_enabled: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create Express account
      logStep("Creating new Express account");
      
      const account = await stripe.accounts.create({
        type: "express",
        country: "IT",
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeAccountId = account.id;
      logStep("Stripe account created", { stripeAccountId });

      // Save to DB
      const { error: insertError } = await supabase
        .from("stripe_connected_accounts")
        .insert({
          user_id: user.id,
          stripe_account_id: account.id,
          onboarding_complete: false,
          charges_enabled: false,
          payouts_enabled: false,
        });

      if (insertError) {
        logStep("Error saving to DB", insertError);
        // Continue anyway - account exists in Stripe
      }
    }

    // Generate account link for onboarding
    const origin = req.headers.get("origin") || PRODUCTION_DOMAIN;
    
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/wallet?stripe_refresh=true`,
      return_url: `${origin}/wallet?stripe_onboarding=complete`,
      type: "account_onboarding",
    });

    logStep("Account link created", { url: accountLink.url });

    return new Response(
      JSON.stringify({ url: accountLink.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const stripeError = error as { type?: string; code?: string; requestId?: string };
    
    logStep("ERROR", { 
      message: errorMessage,
      type: stripeError.type,
      code: stripeError.code,
      requestId: stripeError.requestId
    });
    
    // User-friendly message based on error type
    let userMessage = "Impossibile avviare la verifica. Riprova più tardi.";
    
    if (errorMessage.includes("does not have the required permissions")) {
      userMessage = "Configurazione Stripe incompleta. Contatta il supporto.";
    } else if (errorMessage.includes("Invalid API Key")) {
      userMessage = "Chiave API Stripe non valida. Contatta il supporto.";
    } else if (errorMessage.includes("transfers") || errorMessage.includes("capabilities")) {
      userMessage = "Account Stripe non abilitato ai trasferimenti. Completa la verifica.";
    }
    
    return new Response(
      JSON.stringify({ 
        error: userMessage, 
        details: errorMessage,
        stripeRequestId: stripeError.requestId || null
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
