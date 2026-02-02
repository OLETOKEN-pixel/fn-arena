-- =====================================================
-- Fix submit_team_declaration: Normalize input to UPPERCASE
-- =====================================================
-- The frontend sends 'WIN'/'LOSS' (uppercase) but the old function
-- validated against 'win'/'loss' (lowercase), causing "Invalid result" errors.
-- 
-- Must DROP first because return type changed from json to jsonb.

DROP FUNCTION IF EXISTS public.submit_team_declaration(uuid, text);

CREATE FUNCTION public.submit_team_declaration(
  p_match_id uuid,
  p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_result text;
  v_match matches%ROWTYPE;
  v_participant match_participants%ROWTYPE;
  v_team_side text;
  v_existing_team_result text;
  v_opp_team_side text;
  v_opp_result text;
  v_opp_user_ids uuid[];
  v_finalize jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_authenticated', 'error', 'Not authenticated');
  END IF;

  -- NORMALIZE INPUT: uppercase and trim
  v_result := UPPER(TRIM(p_result));
  
  IF v_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_result', 'error', 'Invalid result. Must be WIN or LOSS');
  END IF;

  -- Lock the match row
  SELECT * INTO v_match
  FROM matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'Match not found');
  END IF;

  -- Check match status
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_status', 'error', 'Match is not in progress or result pending');
  END IF;

  -- Get participant record
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_participant', 'error', 'You are not a participant in this match');
  END IF;

  v_team_side := v_participant.team_side;

  -- Check if team already declared (lock-after-first-submit rule)
  SELECT mp.result_choice INTO v_existing_team_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side = v_team_side
    AND mp.result_choice IS NOT NULL
  LIMIT 1;

  IF v_existing_team_result IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_submitted',
      'message', 'Your team has already declared: ' || v_existing_team_result
    );
  END IF;

  -- Update ALL participants of this team with the result (team-wide declaration)
  UPDATE match_participants
  SET result_choice = v_result,
      result_at = now()
  WHERE match_id = p_match_id
    AND team_side = v_team_side;

  -- Update match status to result_pending if not already
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;

  -- Get opponent team side
  v_opp_team_side := CASE WHEN v_team_side = 'A' THEN 'B' ELSE 'A' END;

  -- Get opponent user IDs for event targeting
  SELECT array_agg(user_id) INTO v_opp_user_ids
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = v_opp_team_side;

  -- Emit result_declared event to opponents
  IF v_opp_user_ids IS NOT NULL AND array_length(v_opp_user_ids, 1) > 0 THEN
    PERFORM emit_match_event(
      p_match_id,
      'result_declared',
      v_caller_id,
      v_opp_user_ids,
      jsonb_build_object('team_side', v_team_side, 'result', v_result)
    );
  END IF;

  -- Check if opponent team has also declared
  SELECT mp.result_choice INTO v_opp_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side = v_opp_team_side
    AND mp.result_choice IS NOT NULL
  LIMIT 1;

  -- If both teams declared, attempt finalization
  IF v_opp_result IS NOT NULL THEN
    v_finalize := try_finalize_match(p_match_id);
    RETURN jsonb_build_object(
      'success', true,
      'status', COALESCE(v_finalize->>'status', 'submitted'),
      'winner_side', v_finalize->>'winner_side',
      'message', v_finalize->>'message'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'submitted',
    'message', 'Result declared. Waiting for opponent team.'
  );
END;
$$;