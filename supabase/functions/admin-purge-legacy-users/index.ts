import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The admin user ID that must be preserved
const ADMIN_USER_ID = "ea30bfbf-780e-47ce-be1b-65e229595dc2";

const logStep = (step: string, details?: unknown) => {
  console.log(`[ADMIN-PURGE-LEGACY-USERS] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      logStep("Invalid token", { error: claimsError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = claimsData.claims.sub;
    
    // Check if caller is admin
    const { data: isAdminResult } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!isAdminResult) {
      logStep("Caller is not admin", { callerUserId });
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Admin verified, starting purge");

    // List all users in auth.users
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      logStep("Failed to list users", { error: listError.message });
      return new Response(
        JSON.stringify({ error: "Failed to list users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Found users", { count: users.length });

    const deleted: string[] = [];
    const preserved: string[] = [];
    const errors: string[] = [];

    for (const user of users) {
      if (user.id === ADMIN_USER_ID) {
        preserved.push(user.email || user.id);
        logStep("Preserving admin user", { email: user.email });
        continue;
      }

      try {
        // Delete the user from auth.users (this invalidates all their sessions)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          errors.push(`${user.email}: ${deleteError.message}`);
          logStep("Failed to delete user", { email: user.email, error: deleteError.message });
        } else {
          deleted.push(user.email || user.id);
          logStep("Deleted user", { email: user.email, userId: user.id });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${user.email}: ${errorMsg}`);
        logStep("Exception deleting user", { email: user.email, error: errorMsg });
      }
    }

    // Also clean up any orphaned profiles, wallets, and user_roles
    logStep("Cleaning up orphaned data");

    // Delete profiles not belonging to admin
    const { error: profilesError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .neq("user_id", ADMIN_USER_ID);

    if (profilesError) {
      logStep("Error cleaning profiles", { error: profilesError.message });
    }

    // Delete wallets not belonging to admin
    const { error: walletsError } = await supabaseAdmin
      .from("wallets")
      .delete()
      .neq("user_id", ADMIN_USER_ID);

    if (walletsError) {
      logStep("Error cleaning wallets", { error: walletsError.message });
    }

    // Delete user_roles not belonging to admin
    const { error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .neq("user_id", ADMIN_USER_ID);

    if (rolesError) {
      logStep("Error cleaning user_roles", { error: rolesError.message });
    }

    logStep("Purge completed", { 
      deleted: deleted.length, 
      preserved: preserved.length, 
      errors: errors.length 
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deleted.length,
        deletedEmails: deleted,
        preserved: preserved.length,
        preservedEmails: preserved,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully purged ${deleted.length} legacy users. Admin preserved.`
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
