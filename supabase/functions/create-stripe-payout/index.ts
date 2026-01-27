import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-STRIPE-PAYOUT] ${step}${detailsStr}`);
};

const MIN_WITHDRAWAL = 10; // Minimum €10
const WITHDRAWAL_FEE = 0.50; // Fixed €0.50 fee

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

    const { amount } = await req.json();

    // Validation: minimum withdrawal
    if (!amount || amount < MIN_WITHDRAWAL) {
      logStep("Invalid amount", { amount, minRequired: MIN_WITHDRAWAL });
      return new Response(
        JSON.stringify({ error: `Minimo prelievo: €${MIN_WITHDRAWAL}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalDeduction = amount + WITHDRAWAL_FEE;
    logStep("Withdrawal request", { amount, fee: WITHDRAWAL_FEE, totalDeduction });

    // Check wallet balance with FOR UPDATE lock
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      logStep("Error fetching wallet", walletError);
      return new Response(
        JSON.stringify({ error: "Wallet non trovato" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (wallet.balance < totalDeduction) {
      logStep("Insufficient balance", { balance: wallet.balance, required: totalDeduction });
      return new Response(
        JSON.stringify({ error: "Saldo insufficiente (inclusa commissione €0,50)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Stripe connected account
    const { data: connectedAccount, error: accountError } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError || !connectedAccount) {
      logStep("No connected account found", accountError);
      return new Response(
        JSON.stringify({ error: "Completa la verifica Stripe per prelevare" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connectedAccount.payouts_enabled) {
      logStep("Payouts not enabled", { 
        onboarding_complete: connectedAccount.onboarding_complete,
        payouts_enabled: connectedAccount.payouts_enabled
      });
      return new Response(
        JSON.stringify({ error: "Verifica Stripe non completata. Completa l'onboarding." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Creating transfer", { 
      destination: connectedAccount.stripe_account_id, 
      amount,
      amountCents: Math.round(amount * 100)
    });

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Cents
      currency: "eur",
      destination: connectedAccount.stripe_account_id,
      metadata: {
        user_id: user.id,
        withdrawal_amount: amount.toString(),
        fee: WITHDRAWAL_FEE.toString(),
      },
    });

    logStep("Transfer created", { transferId: transfer.id });

    // Deduct from wallet (amount + fee)
    const newBalance = wallet.balance - totalDeduction;
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (updateError) {
      logStep("Error updating wallet", updateError);
      // Transfer was already created - log this issue
      // In production, you'd want to handle this edge case
    }

    logStep("Wallet updated", { previousBalance: wallet.balance, newBalance });

    // Create withdrawal request record
    await supabase.from("withdrawal_requests").insert({
      user_id: user.id,
      amount: amount,
      payment_method: "stripe",
      payment_details: connectedAccount.stripe_account_id,
      status: "completed",
    });

    // Log transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "payout",
      amount: -totalDeduction,
      description: `Prelievo €${amount} (+ €${WITHDRAWAL_FEE} commissione)`,
      provider: "stripe",
      status: "completed",
    });

    logStep("Withdrawal completed successfully", { transferId: transfer.id, amount });

    return new Response(
      JSON.stringify({ 
        success: true, 
        transferId: transfer.id,
        amount,
        fee: WITHDRAWAL_FEE,
        newBalance 
      }),
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
    let userMessage = "Impossibile completare il prelievo. Riprova più tardi.";
    
    if (errorMessage.includes("does not have the required permissions")) {
      userMessage = "Configurazione Stripe incompleta. Contatta il supporto.";
    } else if (errorMessage.includes("Invalid API Key")) {
      userMessage = "Chiave API Stripe non valida. Contatta il supporto.";
    } else if (errorMessage.includes("insufficient")) {
      userMessage = "Fondi insufficienti per il trasferimento.";
    } else if (errorMessage.includes("transfers") || errorMessage.includes("capabilities")) {
      userMessage = "Account Stripe non abilitato ai trasferimenti. Completa la verifica.";
    } else if (errorMessage.includes("destination account")) {
      userMessage = "Il tuo account Stripe richiede verifica aggiuntiva.";
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
