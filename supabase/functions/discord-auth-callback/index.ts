import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[DISCORD-AUTH-CALLBACK] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { code, state } = await req.json();

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Missing code or state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Received callback", { state: state.substring(0, 8) + "..." });

    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET");
    const redirectUri = Deno.env.get("DISCORD_REDIRECT_URI");
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");

    if (!clientId || !clientSecret || !redirectUri) {
      logStep("Missing Discord credentials");
      return new Response(
        JSON.stringify({ error: "Discord OAuth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Validate state
    const { data: stateRecord, error: stateError } = await supabaseAdmin
      .from("discord_oauth_states")
      .select("*")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (stateError || !stateRecord) {
      logStep("Invalid or expired state", { error: stateError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid or expired state. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("State validated", { redirectAfter: stateRecord.redirect_after });

    // Delete used state (one-time use)
    await supabaseAdmin
      .from("discord_oauth_states")
      .delete()
      .eq("id", stateRecord.id);

    // Exchange code for token
    logStep("Exchanging code for token");
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logStep("Token exchange failed", { status: tokenResponse.status, error: errorText });
      return new Response(
        JSON.stringify({ error: "Failed to exchange authorization code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json();
    logStep("Token received", { tokenType: tokenData.token_type, scope: tokenData.scope });

    // Fetch Discord user profile
    logStep("Fetching Discord user profile");
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      logStep("User fetch failed", { status: userResponse.status, error: errorText });
      return new Response(
        JSON.stringify({ error: "Failed to fetch Discord user profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const discordUser = await userResponse.json();
    logStep("Discord user fetched", { 
      id: discordUser.id, 
      username: discordUser.username,
      globalName: discordUser.global_name,
      hasEmail: !!discordUser.email 
    });

    // Build avatar URL
    const discordAvatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : null;

    // Check if user already exists by discord_user_id or email
    let existingProfile = null;
    let existingUser = null;

    // First, check by discord_user_id
    const { data: profileByDiscord } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email")
      .eq("discord_user_id", discordUser.id)
      .maybeSingle();

    if (profileByDiscord) {
      existingProfile = profileByDiscord;
      logStep("Found existing profile by discord_user_id", { userId: existingProfile.user_id });
    } else if (discordUser.email) {
      // Check by email
      const { data: profileByEmail } = await supabaseAdmin
        .from("profiles")
        .select("user_id, email")
        .eq("email", discordUser.email)
        .maybeSingle();

      if (profileByEmail) {
        existingProfile = profileByEmail;
        logStep("Found existing profile by email", { userId: existingProfile.user_id });
      }
    }

    let userId: string;

    if (existingProfile) {
      // Update existing profile with Discord data
      userId = existingProfile.user_id;
      
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          discord_user_id: discordUser.id,
          discord_username: discordUser.username,
          discord_display_name: discordUser.global_name || discordUser.username,
          discord_avatar_url: discordAvatarUrl,
          discord_linked_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (updateError) {
        logStep("Profile update error", { error: updateError.message });
        throw updateError;
      }

      logStep("Profile updated with Discord data");
    } else {
      // Create new user
      logStep("Creating new user");

      if (!discordUser.email) {
        return new Response(
          JSON.stringify({ error: "Email is required. Please authorize email access on Discord." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate a unique username
      let baseUsername = discordUser.username.replace(/[^a-zA-Z0-9_]/g, "");
      if (baseUsername.length < 3) {
        baseUsername = "user" + discordUser.id.substring(0, 6);
      }

      let finalUsername = baseUsername;
      let counter = 1;
      while (true) {
        const { data: existingUsername } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", finalUsername)
          .maybeSingle();

        if (!existingUsername) break;
        finalUsername = `${baseUsername}${counter}`;
        counter++;
        if (counter > 100) {
          finalUsername = `${baseUsername}${Date.now().toString().slice(-6)}`;
          break;
        }
      }

      // Create auth user
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: discordUser.email,
        email_confirm: true,
        user_metadata: { 
          discord_id: discordUser.id,
          discord_username: discordUser.username 
        },
      });

      if (authError) {
        logStep("Auth user creation error", { error: authError.message });
        
        // If email already exists, try to link the account
        if (authError.message.includes("already been registered")) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const matchingUser = users.find(u => u.email === discordUser.email);
          
          if (matchingUser) {
            userId = matchingUser.id;
            
            // Update the existing profile with Discord data
            await supabaseAdmin
              .from("profiles")
              .update({
                discord_user_id: discordUser.id,
                discord_username: discordUser.username,
                discord_display_name: discordUser.global_name || discordUser.username,
                discord_avatar_url: discordAvatarUrl,
                discord_linked_at: new Date().toISOString(),
              })
              .eq("user_id", userId);

            logStep("Linked Discord to existing user by email");
          } else {
            throw authError;
          }
        } else {
          throw authError;
        }
      } else {
        userId = authUser.user.id;

        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .insert({
            user_id: userId,
            username: finalUsername,
            email: discordUser.email,
            discord_user_id: discordUser.id,
            discord_username: discordUser.username,
            discord_display_name: discordUser.global_name || discordUser.username,
            discord_avatar_url: discordAvatarUrl,
            discord_linked_at: new Date().toISOString(),
          });

        if (profileError) {
          logStep("Profile creation error", { error: profileError.message });
          throw profileError;
        }

        // Create wallet for new user
        await supabaseAdmin
          .from("wallets")
          .insert({ user_id: userId, balance: 0, locked_balance: 0 });

        logStep("New user created", { userId, username: finalUsername });
      }
    }

    // Auto-join Discord server (non-blocking)
    if (botToken && guildId) {
      logStep("Attempting auto-join to Discord server");
      try {
        const joinResponse = await fetch(
          `https://discord.com/api/guilds/${guildId}/members/${discordUser.id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              access_token: tokenData.access_token,
            }),
          }
        );

        if (joinResponse.status === 201) {
          logStep("User added to Discord server");
        } else if (joinResponse.status === 204) {
          logStep("User already a member of Discord server");
        } else {
          const errorText = await joinResponse.text();
          logStep("Auto-join failed", { status: joinResponse.status, error: errorText });
          // Don't throw - login should still succeed
        }
      } catch (joinError) {
        logStep("Auto-join error", { error: joinError instanceof Error ? joinError.message : "Unknown" });
        // Don't throw - login should still succeed
      }
    } else {
      logStep("Skipping auto-join - bot token or guild ID not configured");
    }

    // Generate a magic link for the user to sign in
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: existingProfile?.email || discordUser.email,
      options: {
        redirectTo: stateRecord.redirect_after || "/",
      },
    });

    if (linkError) {
      logStep("Magic link generation error", { error: linkError.message });
      throw linkError;
    }

    // Extract the token from the link
    const linkUrl = new URL(linkData.properties.action_link);
    const token = linkUrl.hash.replace("#", "");
    const tokenParams = new URLSearchParams(token);

    logStep("Login successful", { userId, redirectTo: stateRecord.redirect_after });

    return new Response(
      JSON.stringify({
        success: true,
        redirectTo: stateRecord.redirect_after || "/",
        // Return the magic link parameters for the frontend to use
        accessToken: tokenParams.get("access_token"),
        refreshToken: tokenParams.get("refresh_token"),
        type: tokenParams.get("type"),
        userId,
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
