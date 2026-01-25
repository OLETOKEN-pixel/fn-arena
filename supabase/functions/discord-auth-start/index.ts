import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[DISCORD-AUTH-START] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const redirectUri = Deno.env.get("DISCORD_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      logStep("Missing Discord credentials", { hasClientId: !!clientId, hasRedirectUri: !!redirectUri });
      return new Response(
        JSON.stringify({ error: "Discord OAuth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body for redirect info
    let redirectAfter = "/";
    let isLogin = true;
    try {
      const body = await req.json();
      redirectAfter = body.redirectAfter || "/";
      isLogin = body.isLogin !== false;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // Clean up any expired states first
    await supabaseAdmin
      .from("discord_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Insert new state
    const { error: stateError } = await supabaseAdmin
      .from("discord_oauth_states")
      .insert({ 
        state,
        redirect_after: redirectAfter,
        is_login: isLogin,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      });

    if (stateError) {
      logStep("State insert error", { error: stateError.message });
      throw stateError;
    }

    logStep("State saved", { state: state.substring(0, 8) + "..." });

    // Build Discord authorization URL
    // Scopes: identify (required), email (for account linking), guilds.join (for auto-join)
    const authUrl = new URL("https://discord.com/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "identify email guilds.join");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "consent"); // Always show consent screen

    logStep("Authorization URL built", { 
      redirectUri,
      scope: "identify email guilds.join"
    });

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
