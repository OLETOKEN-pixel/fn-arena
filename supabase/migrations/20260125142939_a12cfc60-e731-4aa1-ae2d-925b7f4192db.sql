-- Add Discord fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_user_id TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_linked_at TIMESTAMPTZ;

-- Index for fast lookup by discord_user_id
CREATE INDEX IF NOT EXISTS idx_profiles_discord_user_id ON public.profiles(discord_user_id) WHERE discord_user_id IS NOT NULL;

-- Create table for Discord OAuth states (anti-CSRF)
CREATE TABLE IF NOT EXISTS public.discord_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  redirect_after TEXT DEFAULT '/',
  is_login BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Enable RLS
ALTER TABLE public.discord_oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage states
CREATE POLICY "Service role can manage discord oauth states"
  ON public.discord_oauth_states
  FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_discord_oauth_states_expires ON public.discord_oauth_states(expires_at);