-- Drop existing functions with different signatures
DROP FUNCTION IF EXISTS public.set_player_ready(uuid);
DROP FUNCTION IF EXISTS public.submit_team_declaration(uuid, text);

-- Recreate set_player_ready with event emission
CREATE OR REPLACE FUNCTION public.set_player_ready(p_match_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_participant record;
  v_all_ready boolean;
  v_targets uuid[];
  v_all_participants uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status != 'ready_check' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not in ready check phase');
  END IF;

  SELECT * INTO v_participant 
  FROM match_participants 
  WHERE match_id = p_match_id AND user_id = v_user_id;
  
  IF v_participant IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not a participant');
  END IF;

  UPDATE match_participants 
  SET ready = true, ready_at = now()
  WHERE match_id = p_match_id AND user_id = v_user_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM match_participants 
    WHERE match_id = p_match_id AND ready = false
  ) INTO v_all_ready;

  SELECT array_agg(user_id) INTO v_targets
  FROM match_participants
  WHERE match_id = p_match_id AND user_id != v_user_id;

  IF v_all_ready THEN
    UPDATE matches 
    SET status = 'in_progress', started_at = now()
    WHERE id = p_match_id;

    SELECT array_agg(user_id) INTO v_all_participants
    FROM match_participants WHERE match_id = p_match_id;

    PERFORM emit_match_event(p_match_id, 'all_ready', v_user_id, v_all_participants, '{}'::jsonb);

    RETURN json_build_object('success', true, 'all_ready', true, 'message', 'Match started');
  ELSE
    IF v_targets IS NOT NULL AND array_length(v_targets, 1) > 0 THEN
      PERFORM emit_match_event(p_match_id, 'ready', v_user_id, v_targets, '{}'::jsonb);
    END IF;

    RETURN json_build_object('success', true, 'all_ready', false, 'message', 'Marked as ready');
  END IF;
END;
$$;

-- Recreate submit_team_declaration with event emission
CREATE OR REPLACE FUNCTION public.submit_team_declaration(
  p_match_id uuid,
  p_result text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_participant record;
  v_my_team_side text;
  v_targets uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_result NOT IN ('win', 'loss') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid result. Must be win or loss');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN json_build_object('success', false, 'error', 'Match is not ready for result declaration');
  END IF;

  SELECT * INTO v_participant 
  FROM match_participants 
  WHERE match_id = p_match_id AND user_id = v_user_id;
  
  IF v_participant IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not a participant');
  END IF;

  v_my_team_side := v_participant.team_side;

  IF v_participant.result_choice IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Already declared result');
  END IF;

  UPDATE match_participants 
  SET result_choice = p_result, result_at = now()
  WHERE match_id = p_match_id AND user_id = v_user_id;

  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;

  SELECT array_agg(mp.user_id) INTO v_targets
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side != v_my_team_side;

  IF v_targets IS NOT NULL AND array_length(v_targets, 1) > 0 THEN
    PERFORM emit_match_event(
      p_match_id,
      'declare',
      v_user_id,
      v_targets,
      jsonb_build_object('result', p_result, 'team_side', v_my_team_side)
    );
  END IF;

  RETURN json_build_object('success', true, 'message', 'Result declared');
END;
$$;