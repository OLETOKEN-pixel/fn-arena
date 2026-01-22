-- Fix: declare_result must not reference non-existent match_participants.updated_at
-- Minimal patch: replace only the affected UPDATE, keep logic unchanged.
CREATE OR REPLACE FUNCTION public.declare_result(
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
  v_match matches%ROWTYPE;
  v_participant match_participants%ROWTYPE;
  v_opponent_result text;
  v_winner_side text;
  v_is_captain boolean;
  v_finalize_result jsonb;
BEGIN
  -- Validate result value
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
  END IF;

  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match is in valid state for result declaration
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in a state that allows result declaration');
  END IF;

  -- Get caller's participation
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id;

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant in this match');
  END IF;

  -- For team matches (team_size > 1), only captain can declare
  IF v_match.team_size > 1 THEN
    v_is_captain := (
      (v_participant.team_side = 'A' AND v_match.captain_a_user_id = v_caller_id) OR
      (v_participant.team_side = 'B' AND v_match.captain_b_user_id = v_caller_id)
    );

    IF NOT v_is_captain THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only team captain can declare results');
    END IF;
  END IF;

  -- Check if this team already submitted
  IF v_participant.result_choice IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Result already declared', 'status', 'already_submitted', 'message', 'Hai già dichiarato il risultato per questo team');
  END IF;

  -- Save result for this participant (and all team members for consistency)
  -- IMPORTANT: match_participants has no updated_at column. Use result_at.
  UPDATE match_participants
  SET result_choice = p_result,
      result_at = now()
  WHERE match_id = p_match_id AND team_side = v_participant.team_side;

  -- Update match status to result_pending if not already
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending', updated_at = now() WHERE id = p_match_id;
  END IF;

  -- Check opponent's result
  SELECT result_choice INTO v_opponent_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side != v_participant.team_side
  LIMIT 1;

  -- If opponent hasn't declared yet, we wait
  IF v_opponent_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_opponent', 'message', 'In attesa della dichiarazione avversaria');
  END IF;

  -- Both sides have declared - determine outcome
  IF (p_result = 'WIN' AND v_opponent_result = 'LOSS') THEN
    -- Agreement: caller's team won
    v_winner_side := v_participant.team_side;
  ELSIF (p_result = 'LOSS' AND v_opponent_result = 'WIN') THEN
    -- Agreement: opponent's team won
    v_winner_side := CASE WHEN v_participant.team_side = 'A' THEN 'B' ELSE 'A' END;
  ELSE
    -- Conflict: both claim WIN or both claim LOSS -> dispute
    UPDATE matches SET status = 'disputed', updated_at = now() WHERE id = p_match_id;

    -- Create dispute record if match_results table exists for this purpose
    INSERT INTO match_results (match_id, status, team_a_result, team_b_result)
    VALUES (
      p_match_id,
      'disputed',
      CASE WHEN v_participant.team_side = 'A' THEN p_result ELSE v_opponent_result END,
      CASE WHEN v_participant.team_side = 'B' THEN p_result ELSE v_opponent_result END
    )
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      team_a_result = EXCLUDED.team_a_result,
      team_b_result = EXCLUDED.team_b_result,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Risultati in conflitto. Un admin esaminerà il match.');
  END IF;

  -- Agreement reached - finalize match and process payout
  SELECT public.finalize_match_payout(p_match_id, v_winner_side) INTO v_finalize_result;

  -- Check if finalize succeeded
  IF v_finalize_result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Finalize returned null', 'status', 'finalize_failed');
  END IF;

  IF NOT COALESCE((v_finalize_result->>'success')::boolean, false) THEN
    -- Finalize failed - return the error to the frontend
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_finalize_result->>'error', 'Unknown finalize error'),
      'status', 'finalize_failed',
      'message', 'Errore durante la finalizzazione del match. Contatta il supporto.'
    );
  END IF;

  -- Success!
  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'winner_side', v_winner_side,
    'message', 'Match completato con successo!'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'status', 'exception');
END;
$$;


-- Fix: provide match details (including safe participant profiles) without relying on profiles_public view joins
-- Keeps profiles RLS tight; access is restricted to participants/admins.
CREATE OR REPLACE FUNCTION public.get_match_details(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_allowed boolean;
  v_is_admin boolean;
  v_match jsonb;
  v_creator jsonb;
  v_participants jsonb;
  v_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_is_admin := public.is_admin();

  SELECT (v_is_admin OR public.is_match_participant(p_match_id, v_caller_id))
    INTO v_is_allowed;

  IF NOT COALESCE(v_is_allowed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Match row
  SELECT to_jsonb(m.*) INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Creator (safe fields only)
  SELECT to_jsonb(row)
  INTO v_creator
  FROM (
    SELECT p.user_id, p.username, p.avatar_url, p.epic_username
    FROM public.profiles p
    WHERE p.user_id = (v_match->>'creator_id')::uuid
  ) row;

  -- Participants with safe profiles
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY (row.joined_at)), '[]'::jsonb)
  INTO v_participants
  FROM (
    SELECT
      mp.*,
      (
        SELECT to_jsonb(pp)
        FROM (
          SELECT p.user_id, p.username, p.avatar_url, p.epic_username
          FROM public.profiles p
          WHERE p.user_id = mp.user_id
        ) pp
      ) AS profile
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
  ) row;

  -- Result row (if any)
  SELECT to_jsonb(r.*)
  INTO v_result
  FROM public.match_results r
  WHERE r.match_id = p_match_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'match', v_match || jsonb_build_object(
      'creator', v_creator,
      'participants', v_participants,
      'result', v_result
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;