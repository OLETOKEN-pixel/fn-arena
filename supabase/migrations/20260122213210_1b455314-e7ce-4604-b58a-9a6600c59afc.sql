-- Add idempotent finalize + membership-based submit wrapper

CREATE OR REPLACE FUNCTION public.try_finalize_match(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_a_result text;
  v_b_result text;
  v_winner_side text;
  v_finalize jsonb;
  v_payout_exists boolean;
  v_total_locked numeric;
  v_expected_locked numeric;
  v_note text;
  v_host_payer uuid;
  v_joiner_payer uuid;
BEGIN
  -- Lock match row to serialize settlement
  SELECT * INTO v_match
  FROM matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'Match not found');
  END IF;

  RAISE NOTICE '[try_finalize_match] start match_id=% status=% team_size=%', v_match.id, v_match.status, v_match.team_size;

  -- If a payout already exists, treat as finalized (idempotent)
  SELECT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.match_id = p_match_id
      AND t.type = 'payout'
      AND t.status = 'completed'
  ) INTO v_payout_exists;

  IF v_payout_exists THEN
    RAISE NOTICE '[try_finalize_match] already paid, normalizing status';
    IF v_match.status NOT IN ('completed','admin_resolved','finished') THEN
      UPDATE matches SET status = 'completed', finished_at = COALESCE(finished_at, now())
      WHERE id = p_match_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'status', 'already_finalized');
  END IF;

  -- Terminal states (no-op)
  IF v_match.status IN ('completed','admin_resolved','finished','expired','cancelled','canceled') THEN
    RETURN jsonb_build_object('success', true, 'status', 'terminal');
  END IF;

  -- Must be in active flow
  IF v_match.status NOT IN ('in_progress','result_pending','disputed') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_state', 'error', 'Match not in finalizable state');
  END IF;

  -- Read team declarations (stored on match_participants)
  SELECT mp.result_choice INTO v_a_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id AND mp.team_side = 'A' AND mp.result_choice IS NOT NULL
  LIMIT 1;

  SELECT mp.result_choice INTO v_b_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id AND mp.team_side = 'B' AND mp.result_choice IS NOT NULL
  LIMIT 1;

  RAISE NOTICE '[try_finalize_match] declarations A=% B=%', v_a_result, v_b_result;

  IF v_a_result IS NULL OR v_b_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'need_other_team');
  END IF;

  -- Determine winner or dispute
  IF v_a_result = 'WIN' AND v_b_result = 'LOSS' THEN
    v_winner_side := 'A';
  ELSIF v_a_result = 'LOSS' AND v_b_result = 'WIN' THEN
    v_winner_side := 'B';
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Conflicting team declarations', 'try_finalize_match: conflicting declarations')
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'conflict');
  END IF;

  -- Preflight: detect lock inconsistencies (safe-fail to disputed)
  SELECT COALESCE(SUM(t.amount), 0) INTO v_total_locked
  FROM transactions t
  WHERE t.match_id = p_match_id AND t.type = 'lock' AND t.status = 'completed';

  v_expected_locked := (v_match.entry_fee * (COALESCE(v_match.team_size, 1) * 2));

  RAISE NOTICE '[try_finalize_match] locks total=% expected=%', v_total_locked, v_expected_locked;

  IF v_total_locked <> v_expected_locked THEN
    v_note := format('try_finalize_match: lock_mismatch total_locked=%s expected=%s', v_total_locked, v_expected_locked);
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_note)
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
  END IF;

  -- Self-heal payer ids for COVER if missing (best-effort, deterministic)
  v_host_payer := v_match.host_payer_user_id;
  v_joiner_payer := v_match.joiner_payer_user_id;

  IF v_match.team_size > 1 THEN
    IF v_match.payment_mode_host = 'cover' AND v_host_payer IS NULL THEN
      -- Prefer creator_id as host payer; fallback to first cover lock
      v_host_payer := v_match.creator_id;
      IF v_host_payer IS NULL THEN
        SELECT t.user_id INTO v_host_payer
        FROM transactions t
        WHERE t.match_id = p_match_id
          AND t.type = 'lock'
          AND t.status = 'completed'
          AND (t.description ILIKE '%cover%')
        ORDER BY t.created_at ASC
        LIMIT 1;
      END IF;

      IF v_host_payer IS NOT NULL THEN
        UPDATE matches SET host_payer_user_id = v_host_payer WHERE id = p_match_id;
      END IF;
    END IF;

    IF v_match.payment_mode_joiner = 'cover' AND v_joiner_payer IS NULL THEN
      -- Try pick cover lock that is not creator_id (if possible)
      SELECT t.user_id INTO v_joiner_payer
      FROM transactions t
      WHERE t.match_id = p_match_id
        AND t.type = 'lock'
        AND t.status = 'completed'
        AND (t.description ILIKE '%cover%')
        AND (v_match.creator_id IS NULL OR t.user_id <> v_match.creator_id)
      ORDER BY t.created_at DESC
      LIMIT 1;

      IF v_joiner_payer IS NOT NULL THEN
        UPDATE matches SET joiner_payer_user_id = v_joiner_payer WHERE id = p_match_id;
      END IF;
    END IF;

    -- If still missing payer in COVER, safe-fail
    IF v_match.payment_mode_host = 'cover' AND (SELECT host_payer_user_id FROM matches WHERE id=p_match_id) IS NULL THEN
      v_note := 'try_finalize_match: missing_host_payer_for_cover';
      UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
      INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
      VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_note)
      ON CONFLICT (match_id) DO UPDATE SET
        status = 'disputed',
        dispute_reason = EXCLUDED.dispute_reason,
        admin_notes = EXCLUDED.admin_notes,
        updated_at = now();
      RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'missing_payer');
    END IF;

    IF v_match.payment_mode_joiner = 'cover' AND (SELECT joiner_payer_user_id FROM matches WHERE id=p_match_id) IS NULL THEN
      v_note := 'try_finalize_match: missing_joiner_payer_for_cover';
      UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
      INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
      VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_note)
      ON CONFLICT (match_id) DO UPDATE SET
        status = 'disputed',
        dispute_reason = EXCLUDED.dispute_reason,
        admin_notes = EXCLUDED.admin_notes,
        updated_at = now();
      RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'missing_payer');
    END IF;
  END IF;

  -- Attempt payout (idempotence is enforced inside finalize_match_payout too, but we also guard above)
  RAISE NOTICE '[try_finalize_match] calling finalize_match_payout winner_side=%', v_winner_side;
  SELECT public.finalize_match_payout(p_match_id, v_winner_side) INTO v_finalize;

  IF v_finalize IS NULL THEN
    RAISE EXCEPTION 'finalize_match_payout returned null';
  END IF;

  IF COALESCE((v_finalize->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'finalize_match_payout failed: %', COALESCE(v_finalize->>'error', v_finalize::text);
  END IF;

  -- Ensure match is terminal
  UPDATE matches
  SET status = 'completed',
      finished_at = COALESCE(finished_at, now())
  WHERE id = p_match_id;

  RAISE NOTICE '[try_finalize_match] completed';

  RETURN jsonb_build_object('success', true, 'status', 'completed', 'winner_side', v_winner_side);

EXCEPTION
  WHEN OTHERS THEN
    -- On any settlement error: dispute + log (as requested)
    v_note := format('try_finalize_match: settlement_error=%s', SQLERRM);

    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Settlement error', v_note)
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'settlement_error', 'message', SQLERRM);
END;
$$;


CREATE OR REPLACE FUNCTION public.submit_team_declaration(
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
  v_team_side text;
  v_existing_team_result text;
  v_opp_result text;
  v_finalize jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_authenticated', 'error', 'Not authenticated');
  END IF;

  IF p_result NOT IN ('WIN','LOSS') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_result', 'error', 'Invalid result');
  END IF;

  -- Lock match first to serialize submits as well
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'Match not found');
  END IF;

  IF v_match.status IN ('completed','admin_resolved','finished','expired','cancelled','canceled') THEN
    RETURN jsonb_build_object('success', true, 'status', 'terminal');
  END IF;

  IF v_match.status NOT IN ('in_progress','result_pending') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_state', 'error', 'Match not in declaration state');
  END IF;

  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id;

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_participant', 'error', 'Not a participant');
  END IF;

  v_team_side := v_participant.team_side;

  -- lock-after-first-submit per team_side
  SELECT mp.result_choice INTO v_existing_team_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side = v_team_side
    AND mp.result_choice IS NOT NULL
  LIMIT 1;

  IF v_existing_team_result IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_submitted', 'message', 'Il tuo team ha già dichiarato (bloccato).');
  END IF;

  UPDATE match_participants
  SET result_choice = p_result,
      result_at = now()
  WHERE match_id = p_match_id
    AND team_side = v_team_side;

  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;

  -- Check if opponent already declared
  SELECT mp.result_choice INTO v_opp_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side <> v_team_side
    AND mp.result_choice IS NOT NULL
  LIMIT 1;

  IF v_opp_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_other_team');
  END IF;

  -- One attempt to finalize (manual retry only means we don't retry on already_submitted)
  SELECT public.try_finalize_match(p_match_id) INTO v_finalize;
  RETURN COALESCE(v_finalize, jsonb_build_object('success', false, 'status', 'finalize_failed'));
END;
$$;