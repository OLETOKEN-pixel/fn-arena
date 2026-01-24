-- Add Epic OAuth fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS epic_account_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS epic_linked_at TIMESTAMPTZ;

-- Create table for OAuth state validation (anti-CSRF)
CREATE TABLE IF NOT EXISTS public.epic_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  state TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Create index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_epic_oauth_states_expires ON public.epic_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_epic_oauth_states_state ON public.epic_oauth_states(state);

-- Enable RLS
ALTER TABLE public.epic_oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only manage their own states
CREATE POLICY "Users can insert own oauth states"
  ON public.epic_oauth_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own oauth states"
  ON public.epic_oauth_states
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states"
  ON public.epic_oauth_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policy for edge functions (cleanup, validation)
CREATE POLICY "Service role can manage all oauth states"
  ON public.epic_oauth_states
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add realtime for epic_oauth_states if needed
ALTER PUBLICATION supabase_realtime ADD TABLE public.epic_oauth_states;