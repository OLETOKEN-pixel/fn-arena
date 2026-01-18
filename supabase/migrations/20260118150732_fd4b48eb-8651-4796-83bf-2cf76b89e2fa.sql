-- Fix: Remove overly permissive INSERT policy on notifications table
-- Notifications should ONLY be created through SECURITY DEFINER functions
-- which properly validate context before inserting (e.g., send_team_invite, respond_to_invite, etc.)

-- Drop the permissive INSERT policy that allows any user to insert notifications for anyone
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- No new INSERT policy is needed because:
-- 1. SECURITY DEFINER functions bypass RLS and can still insert notifications
-- 2. Direct client inserts should NOT be allowed to prevent spam/phishing attacks
-- 3. Existing functions like send_team_invite, respond_to_invite, etc. handle notification creation securely