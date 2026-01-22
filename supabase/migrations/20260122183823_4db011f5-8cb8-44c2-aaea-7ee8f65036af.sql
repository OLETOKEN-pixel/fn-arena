-- Surgical fix: remove references to non-existent matches.updated_at (and ensure no match_participants.updated_at usage)

-- 1) declare_result: keep logic identical, only remove matches.updated_at writes
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
    -- matches has no updated_at column
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
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
    -- matches has no updated_at column
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

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

-- 2) expire_stale_matches: keep logic identical, only remove matches.updated_at writes
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_participant RECORD;
  v_captain_id uuid;
  v_refund_amount numeric;
  v_expired_count integer := 0;
  v_refunded_total numeric := 0;
BEGIN
  -- Find all matches that have expired but are still open or in ready_check
  FOR v_match IN 
    SELECT m.*
    FROM matches m
    WHERE m.status IN ('open', 'ready_check', 'joined', 'full')
      AND m.expires_at < now()
  LOOP
    RAISE NOTICE '[expire_stale_matches] Processing match % (status: %, expires_at: %)', 
      v_match.id, v_match.status, v_match.expires_at;

    -- Process refunds based on team size
    IF v_match.team_size = 1 THEN
      -- 1v1: refund each participant directly
      FOR v_participant IN
        SELECT mp.user_id, mp.team_side
        FROM match_participants mp
        WHERE mp.match_id = v_match.id
      LOOP
        UPDATE wallets
        SET balance = balance + v_match.entry_fee,
            locked_balance = locked_balance - v_match.entry_fee
        WHERE user_id = v_participant.user_id
          AND locked_balance >= v_match.entry_fee;

        IF FOUND THEN
          INSERT INTO transactions (user_id, type, amount, match_id, description)
          VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 
                  'Match expired - automatic refund');
          v_refunded_total := v_refunded_total + v_match.entry_fee;
        END IF;
      END LOOP;
    ELSE
      -- Team match: Team A refund using payment_mode_host
      IF v_match.payment_mode_host = 'cover' THEN
        v_captain_id := v_match.captain_a_user_id;
        IF v_captain_id IS NULL THEN
          SELECT mp.user_id INTO v_captain_id
          FROM match_participants mp
          WHERE mp.match_id = v_match.id AND mp.team_side = 'A'
          ORDER BY mp.joined_at ASC LIMIT 1;
        END IF;
        
        IF v_captain_id IS NOT NULL THEN
          v_refund_amount := v_match.entry_fee * v_match.team_size;
          UPDATE wallets
          SET balance = balance + v_refund_amount,
              locked_balance = locked_balance - v_refund_amount
          WHERE user_id = v_captain_id AND locked_balance >= v_refund_amount;

          IF FOUND THEN
            INSERT INTO transactions (user_id, type, amount, match_id, description)
            VALUES (v_captain_id, 'refund', v_refund_amount, v_match.id, 
                    'Match expired - captain refund (cover mode)');
            v_refunded_total := v_refunded_total + v_refund_amount;
          END IF;
        END IF;
      ELSE
        -- Split mode: refund each Team A member
        FOR v_participant IN
          SELECT mp.user_id FROM match_participants mp
          WHERE mp.match_id = v_match.id AND mp.team_side = 'A'
        LOOP
          UPDATE wallets
          SET balance = balance + v_match.entry_fee,
              locked_balance = locked_balance - v_match.entry_fee
          WHERE user_id = v_participant.user_id AND locked_balance >= v_match.entry_fee;

          IF FOUND THEN
            INSERT INTO transactions (user_id, type, amount, match_id, description)
            VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 
                    'Match expired - automatic refund (split mode)');
            v_refunded_total := v_refunded_total + v_match.entry_fee;
          END IF;
        END LOOP;
      END IF;

      -- Team B refund using payment_mode_joiner (if joined)
      IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = v_match.id AND team_side = 'B') THEN
        IF v_match.payment_mode_joiner = 'cover' THEN
          v_captain_id := v_match.captain_b_user_id;
          IF v_captain_id IS NULL THEN
            SELECT mp.user_id INTO v_captain_id
            FROM match_participants mp
            WHERE mp.match_id = v_match.id AND mp.team_side = 'B'
            ORDER BY mp.joined_at ASC LIMIT 1;
          END IF;
          
          IF v_captain_id IS NOT NULL THEN
            v_refund_amount := v_match.entry_fee * v_match.team_size;
            UPDATE wallets
            SET balance = balance + v_refund_amount,
                locked_balance = locked_balance - v_refund_amount
            WHERE user_id = v_captain_id AND locked_balance >= v_refund_amount;

            IF FOUND THEN
              INSERT INTO transactions (user_id, type, amount, match_id, description)
              VALUES (v_captain_id, 'refund', v_refund_amount, v_match.id, 
                      'Match expired - captain refund (cover mode)');
              v_refunded_total := v_refunded_total + v_refund_amount;
            END IF;
          END IF;
        ELSE
          -- Split mode: refund each Team B member
          FOR v_participant IN
            SELECT mp.user_id FROM match_participants mp
            WHERE mp.match_id = v_match.id AND mp.team_side = 'B'
          LOOP
            UPDATE wallets
            SET balance = balance + v_match.entry_fee,
                locked_balance = locked_balance - v_match.entry_fee
            WHERE user_id = v_participant.user_id AND locked_balance >= v_match.entry_fee;

            IF FOUND THEN
              INSERT INTO transactions (user_id, type, amount, match_id, description)
              VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 
                      'Match expired - automatic refund (split mode)');
              v_refunded_total := v_refunded_total + v_match.entry_fee;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END IF;

    -- Update match status to expired
    -- matches has no updated_at column
    UPDATE matches SET status = 'expired' WHERE id = v_match.id;
    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'refunded_total', v_refunded_total,
    'processed_at', now()
  );
END;
$$;
