import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[EPIC-AUTH-CALLBACK] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const clientId = Deno.env.get("EPIC_CLIENT_ID");
    const clientSecret = Deno.env.get("EPIC_CLIENT_SECRET");
    const redirectUri = Deno.env.get("EPIC_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      logStep("Missing Epic credentials");
      return new Response(
        JSON.stringify({ error: "Epic OAuth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code, state } = await req.json();

    if (!code || !state) {
      logStep("Missing code or state", { hasCode: !!code, hasState: !!state });
      return new Response(
        JSON.stringify({ error: "Missing authorization code or state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Received callback", { state: state.substring(0, 8) + "..." });

    // Use service role for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate state and get user_id
    const { data: stateRecord, error: stateError } = await supabase
      .from("epic_oauth_states")
      .select("*")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (stateError || !stateRecord) {
      logStep("Invalid or expired state", { error: stateError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid or expired authorization state. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = stateRecord.user_id;
    logStep("State validated", { userId });

    // Delete state immediately (one-time use)
    await supabase.from("epic_oauth_states").delete().eq("id", stateRecord.id);

    // Exchange code for access token
    // Epic Games token endpoint: https://api.epicgames.dev/epic/oauth/v2/token
    const tokenUrl = "https://api.epicgames.dev/epic/oauth/v2/token";
    const credentials = btoa(`${clientId}:${clientSecret}`);

    logStep("Exchanging code for token");

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenText = await tokenResponse.text();
    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      logStep("Token response not JSON", { status: tokenResponse.status, body: tokenText.substring(0, 500) });
      return new Response(
        JSON.stringify({ error: "Invalid response from Epic token endpoint" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      logStep("Token exchange failed - FULL ERROR", { 
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: tokenData.error,
        errorDescription: tokenData.error_description,
        redirectUri // Log to verify match
      });
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error || "Failed to exchange code for token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Token received", { 
      expiresIn: tokenData.expires_in,
      accountId: tokenData.account_id 
    });

    // Epic returns account info in token response
    // account_id and displayName should be in the token response
    let epicAccountId = tokenData.account_id;
    let epicDisplayName = tokenData.displayName;

    // If not in token response, fetch from userInfo endpoint (standard OAuth2)
    if (!epicAccountId || !epicDisplayName) {
      logStep("Fetching account info from userInfo endpoint");
      
      // Try the standard OAuth2 userInfo endpoint first
      const userInfoResponse = await fetch("https://api.epicgames.dev/epic/oauth/v2/userInfo", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
        },
      });

      if (userInfoResponse.ok) {
        const userInfoData = await userInfoResponse.json();
        logStep("UserInfo data received", { data: userInfoData });
        
        // Standard OAuth2 claims
        epicAccountId = userInfoData.sub || userInfoData.account_id || epicAccountId;
        epicDisplayName = userInfoData.preferred_username || userInfoData.displayName || userInfoData.name || epicDisplayName;
      } else {
        logStep("UserInfo endpoint failed, trying accounts endpoint", { status: userInfoResponse.status });
        
        // Fallback to accounts endpoint
        const accountResponse = await fetch("https://api.epicgames.dev/epic/id/v2/accounts?accountId=me", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
          },
        });

        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          logStep("Account data received", { data: accountData });
          
          // The response could be an array or object
          if (Array.isArray(accountData) && accountData.length > 0) {
            epicAccountId = accountData[0].accountId || epicAccountId;
            epicDisplayName = accountData[0].displayName || epicDisplayName;
          } else if (accountData.accountId) {
            epicAccountId = accountData.accountId;
            epicDisplayName = accountData.displayName;
          }
        }
      }
    }

    // Fallback: use data from token if still missing
    if (!epicAccountId) {
      epicAccountId = tokenData.account_id;
    }
    if (!epicDisplayName) {
      // Try to get from token's identity claims
      epicDisplayName = tokenData.displayName || tokenData.preferred_username || `Epic_${epicAccountId?.substring(0, 8)}`;
    }

    if (!epicAccountId) {
      logStep("Could not retrieve Epic account ID");
      return new Response(
        JSON.stringify({ error: "Could not retrieve Epic account information" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Epic account info", { epicAccountId, epicDisplayName });

    // Check if this Epic account is already linked to another user
    const { data: existingLink } = await supabase
      .from("profiles")
      .select("user_id, username")
      .eq("epic_account_id", epicAccountId)
      .neq("user_id", userId)
      .maybeSingle();

    if (existingLink) {
      logStep("Epic account already linked to another user", { existingUserId: existingLink.user_id });
      return new Response(
        JSON.stringify({ 
          error: `This Epic Games account is already linked to another user (${existingLink.username}).` 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update user profile with Epic info
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        epic_account_id: epicAccountId,
        epic_username: epicDisplayName,
        epic_linked_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      logStep("Profile update failed", { error: updateError.message, code: updateError.code });
      
      // Handle unique constraint violation
      if (updateError.code === "23505") {
        return new Response(
          JSON.stringify({ error: "This Epic Games account is already linked to another user." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw updateError;
    }

    logStep("Profile updated successfully", { userId, epicDisplayName });

    return new Response(
      JSON.stringify({ 
        success: true, 
        epicUsername: epicDisplayName,
        epicAccountId 
      }),
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
