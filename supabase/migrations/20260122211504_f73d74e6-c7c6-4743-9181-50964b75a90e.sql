-- Patch minima: remove captain-gating in declare_result and use payer columns in finalize_match_payout

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
  v_team_side text;
  v_existing_team_result text;
  v_opponent_result text;
  v_winner_side text;
  v_finalize_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate result value
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
  END IF;

  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Block terminal states
  IF v_match.status IN ('finished', 'expired', 'cancelled', 'completed', 'admin_resolved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is terminal', 'status', 'terminal');
  END IF;

  -- Check match is in valid state for result declaration
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in a state that allows result declaration');
  END IF;

  -- Get caller's participation (membership-based authorization)
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id;

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant in this match', 'status', 'not_participant');
  END IF;

  v_team_side := v_participant.team_side;

  -- "Lock after first submit" per team: if any member on that side already declared, return already_submitted.
  SELECT mp.result_choice
  INTO v_existing_team_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.team_side = v_team_side
    AND mp.result_choice IS NOT NULL
  LIMIT 1;

  IF v_existing_team_result IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_submitted',
      'message', 'Il tuo team ha già dichiarato il risultato (bloccato).'
    );
  END IF;

  -- Persist the declaration for the whole team-side (deterministic team source of truth)
  UPDATE match_participants
  SET result_choice = p_result,
      result_at = now()
  WHERE match_id = p_match_id
    AND team_side = v_team_side;

  -- Update match status to result_pending if not already
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;

  -- Check opponent's result
  SELECT result_choice INTO v_opponent_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side != v_team_side
  LIMIT 1;

  IF v_opponent_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_opponent', 'message', 'In attesa della dichiarazione avversaria');
  END IF;

  -- Both sides have declared - determine outcome
  IF (p_result = 'WIN' AND v_opponent_result = 'LOSS') THEN
    v_winner_side := v_team_side;
  ELSIF (p_result = 'LOSS' AND v_opponent_result = 'WIN') THEN
    v_winner_side := CASE WHEN v_team_side = 'A' THEN 'B' ELSE 'A' END;
  ELSE
    -- Conflict: both claim WIN or both claim LOSS -> dispute (no payout)
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

    -- Record dispute in match_results using ONLY existing columns
    INSERT INTO match_results (match_id, status, dispute_reason)
    VALUES (p_match_id, 'disputed', 'Conflicting team declarations')
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Risultati in conflitto. Un admin esaminerà il match.');
  END IF;

  -- Agreement reached - finalize match and process payout
  SELECT public.finalize_match_payout(p_match_id, v_winner_side) INTO v_finalize_result;

  IF v_finalize_result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Finalize returned null', 'status', 'finalize_failed');
  END IF;

  IF NOT COALESCE((v_finalize_result->>'success')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_finalize_result->>'error', 'Unknown finalize error'),
      'status', 'finalize_failed',
      'message', 'Errore durante la finalizzazione del match. Contatta il supporto.'
    );
  END IF;

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


CREATE OR REPLACE FUNCTION public.finalize_match_payout(
  p_match_id UUID,
  p_winner_side TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_entry_fee NUMERIC;
  v_team_size INT;
  v_total_pool NUMERIC;
  v_platform_fee NUMERIC;
  v_prize_pool NUMERIC;
  v_loser_side TEXT;
  v_winner_team_id UUID;
  v_loser_team_id UUID;
  v_winner_payment_mode TEXT;
  v_loser_payment_mode TEXT;
  v_winner_payer_user_id UUID;
  v_loser_payer_user_id UUID;
  v_payout_per_member NUMERIC;
  v_participant RECORD;
  v_existing_payout BOOLEAN;
  v_wallet_check RECORD;
  v_expected_locked NUMERIC;
  v_winner_user_id UUID;
  v_loser_user_id UUID;
BEGIN
  IF p_winner_side NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid winner side');
  END IF;

  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status NOT IN ('in_progress', 'result_pending', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for finalization');
  END IF;

  -- Idempotency check: prevent double payout
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE match_id = p_match_id AND type = 'payout'
  ) INTO v_existing_payout;

  IF v_existing_payout THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout already processed', 'status', 'already_paid');
  END IF;

  v_entry_fee := v_match.entry_fee;
  v_team_size := v_match.team_size;
  v_loser_side := CASE WHEN p_winner_side = 'A' THEN 'B' ELSE 'A' END;

  -- Keep existing calculation (do not change business rules here)
  v_total_pool := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pool * 0.10;
  v_prize_pool := v_total_pool - v_platform_fee;

  -- Determine payment modes and team IDs
  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
  ELSE
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
  END IF;

  -- Cover payer source of truth: host_payer_user_id / joiner_payer_user_id (NOT captain)
  v_winner_payer_user_id := CASE WHEN p_winner_side = 'A' THEN v_match.host_payer_user_id ELSE v_match.joiner_payer_user_id END;
  v_loser_payer_user_id := CASE WHEN v_loser_side = 'A' THEN v_match.host_payer_user_id ELSE v_match.joiner_payer_user_id END;

  -- 1v1 participants (deterministic, not captain-based)
  IF v_team_size = 1 THEN
    SELECT user_id INTO v_winner_user_id
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = p_winner_side
    LIMIT 1;

    SELECT user_id INTO v_loser_user_id
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = v_loser_side
    LIMIT 1;

    IF v_winner_user_id IS NULL OR v_loser_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Missing participants for 1v1');
    END IF;
  END IF;

  -- PRE-CONDITION CHECK: verify locked_balance in cover mode (atomic)
  IF v_team_size > 1 AND v_loser_payment_mode = 'cover' THEN
    IF v_loser_payer_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Missing payer for loser team (cover)');
    END IF;

    v_expected_locked := v_entry_fee * v_team_size;
    SELECT * INTO v_wallet_check FROM wallets
    WHERE user_id = v_loser_payer_user_id FOR UPDATE;

    IF v_wallet_check.locked_balance < v_expected_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient locked balance for loser payer',
        'expected', v_expected_locked,
        'actual', v_wallet_check.locked_balance,
        'payer_id', v_loser_payer_user_id
      );
    END IF;
  END IF;

  IF v_team_size > 1 AND v_winner_payment_mode = 'cover' THEN
    IF v_winner_payer_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Missing payer for winner team (cover)');
    END IF;

    v_expected_locked := v_entry_fee * v_team_size;
    SELECT * INTO v_wallet_check FROM wallets
    WHERE user_id = v_winner_payer_user_id FOR UPDATE;

    IF v_wallet_check.locked_balance < v_expected_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient locked balance for winner payer',
        'expected', v_expected_locked,
        'actual', v_wallet_check.locked_balance,
        'payer_id', v_winner_payer_user_id
      );
    END IF;
  END IF;

  -- ========================================
  -- PROCESS LOSER SIDE (consume locked funds)
  -- ========================================
  IF v_team_size = 1 THEN
    UPDATE wallets
    SET locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = v_loser_user_id AND id IS NOT NULL;

    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');

    PERFORM record_challenge_event(v_loser_user_id, 'match_completed', p_match_id);

  ELSIF v_loser_payment_mode = 'cover' THEN
    UPDATE wallets
    SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
        updated_at = now()
    WHERE user_id = v_loser_payer_user_id AND id IS NOT NULL;

    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_loser_payer_user_id, 'fee', v_entry_fee * v_team_size, p_match_id, 'Match entry (loss - covered team)', 'completed');

    FOR v_participant IN
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = v_loser_side
    LOOP
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;

  ELSE
    FOR v_participant IN
      SELECT mp.user_id, w.locked_balance
      FROM match_participants mp
      JOIN wallets w ON w.user_id = mp.user_id
      WHERE mp.match_id = p_match_id AND mp.team_side = v_loser_side
      FOR UPDATE OF w
    LOOP
      IF v_participant.locked_balance < v_entry_fee THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Insufficient locked balance for participant',
          'expected', v_entry_fee,
          'actual', v_participant.locked_balance,
          'user_id', v_participant.user_id
        );
      END IF;

      UPDATE wallets
      SET locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant.user_id AND id IS NOT NULL;

      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');

      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- ========================================
  -- PROCESS WINNER SIDE (payout winnings)
  -- ========================================
  IF v_team_size = 1 THEN
    UPDATE wallets
    SET balance = balance + v_prize_pool,
        locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = v_winner_user_id AND id IS NOT NULL;

    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_user_id, 'payout', v_prize_pool, p_match_id, 'Match winnings', 'completed');

    PERFORM record_challenge_event(v_winner_user_id, 'match_completed', p_match_id);

  ELSIF v_winner_payment_mode = 'cover' THEN
    UPDATE wallets
    SET balance = balance + v_prize_pool,
        locked_balance = locked_balance - (v_entry_fee * v_team_size),
        updated_at = now()
    WHERE user_id = v_winner_payer_user_id AND id IS NOT NULL;

    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_payer_user_id, 'payout', v_prize_pool, p_match_id, 'Match winnings (covered team)', 'completed');

    FOR v_participant IN
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = p_winner_side
    LOOP
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;

  ELSE
    v_payout_per_member := v_prize_pool / v_team_size;

    FOR v_participant IN
      SELECT mp.user_id, w.locked_balance
      FROM match_participants mp
      JOIN wallets w ON w.user_id = mp.user_id
      WHERE mp.match_id = p_match_id AND mp.team_side = p_winner_side
      FOR UPDATE OF w
    LOOP
      IF v_participant.locked_balance < v_entry_fee THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Insufficient locked balance for winning participant',
          'expected', v_entry_fee,
          'actual', v_participant.locked_balance,
          'user_id', v_participant.user_id
        );
      END IF;

      UPDATE wallets
      SET balance = balance + v_payout_per_member,
          locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant.user_id AND id IS NOT NULL;

      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'payout', v_payout_per_member, p_match_id, 'Match winnings', 'completed');

      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- Platform fee
  UPDATE platform_wallet
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;

  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);

  -- Update match status
  UPDATE matches
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;

  -- Record result
  INSERT INTO match_results (match_id, winner_user_id, winner_team_id, status)
  VALUES (p_match_id, CASE WHEN v_team_size = 1 THEN v_winner_user_id ELSE v_winner_payer_user_id END, v_winner_team_id, 'confirmed')
  ON CONFLICT (match_id) DO UPDATE SET
    winner_user_id = EXCLUDED.winner_user_id,
    winner_team_id = EXCLUDED.winner_team_id,
    status = 'confirmed',
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'message', 'Match finalized successfully',
    'winner_id', CASE WHEN v_team_size = 1 THEN v_winner_user_id ELSE v_winner_payer_user_id END,
    'winner_team_id', v_winner_team_id,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee
  );
END;
$$;