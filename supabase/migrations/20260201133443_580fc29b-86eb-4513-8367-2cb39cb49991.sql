-- Create match_events table for real-time audio notifications
CREATE TABLE IF NOT EXISTS public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'match_created',
    'player_joined',
    'team_ready',
    'all_ready',
    'match_started',
    'result_declared'
  )),
  actor_user_id uuid,
  target_user_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

-- RLS: Participants and admins can view match events
CREATE POLICY "Participants can view match events" ON public.match_events
  FOR SELECT
  USING (
    auth.uid() = ANY(target_user_ids)
    OR EXISTS (
      SELECT 1 FROM match_participants mp
      WHERE mp.match_id = match_events.match_id
      AND mp.user_id = auth.uid()
    )
    OR is_admin()
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;

-- Create emit_match_event RPC
CREATE OR REPLACE FUNCTION public.emit_match_event(
  p_match_id uuid,
  p_event_type text,
  p_actor_user_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_users uuid[];
  v_event_id uuid;
BEGIN
  -- Get all participants of the match as targets (excluding actor)
  SELECT array_agg(mp.user_id)
  INTO v_target_users
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND (p_actor_user_id IS NULL OR mp.user_id != p_actor_user_id);

  -- Insert the event
  INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids, payload)
  VALUES (p_match_id, p_event_type, p_actor_user_id, COALESCE(v_target_users, '{}'), p_payload)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);
END;
$$;