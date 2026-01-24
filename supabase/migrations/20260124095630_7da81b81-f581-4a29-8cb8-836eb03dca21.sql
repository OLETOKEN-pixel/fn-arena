-- ================================================
-- FIX 1: admin_resolve_match_v3 - Team-aware resolution with proper locked_balance handling
-- FIX 2: auto_refund_expired_matches - Automatic refund after 30 minutes
-- FIX 3: get_admin_issue_stats - Correct expired_with_locks count
-- FIX 4: admin_fix_orphan_locked_balance - Data repair for stuck funds
-- ================================================

-- =============================================================
-- FUNCTION: admin_resolve_match_v3
-- Replaces admin_resolve_match_v2 for ALL match types (1v1 and team)
-- Correctly handles cover/split payment modes and unlocks locked_balance
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_match_v3(
  p_match_id UUID,
  p_action TEXT,   -- 'TEAM_A_WIN', 'TEAM_B_WIN', 'REFUND_BOTH'
  p_notes TEXT DEFAULT NULL
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
  v_winner_side TEXT;
  v_loser_side TEXT;
  v_winner_payment_mode TEXT;
  v_loser_payment_mode TEXT;
  v_winner_payer_user_id UUID;
  v_loser_payer_user_id UUID;
  v_payout_per_member NUMERIC;
  v_participant RECORD;
  v_existing_payout BOOLEAN;
  v_amount_to_unlock NUMERIC;
  v_refund_count INT := 0;
  v_total_refunded NUMERIC := 0;
BEGIN
  -- Admin check
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin only');
  END IF;

  -- Validate action
  IF p_action NOT IN ('TEAM_A_WIN', 'TEAM_B_WIN', 'REFUND_BOTH') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use TEAM_A_WIN, TEAM_B_WIN, or REFUND_BOTH');
  END IF;

  -- Notes required for win/loss resolution
  IF p_action IN ('TEAM_A_WIN', 'TEAM_B_WIN') AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin notes are required for win/loss resolution');
  END IF;

  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check valid state
  IF v_match.status NOT IN ('disputed', 'in_progress', 'result_pending', 'finished', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for admin resolution', 'current_status', v_match.status);
  END IF;

  -- Idempotency check
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE match_id = p_match_id AND type = 'payout'
  ) INTO v_existing_payout;

  IF v_existing_payout THEN
    RETURN jsonb_build_object('success', true, 'already_resolved', true, 'message', 'Match already had payout processed');
  END IF;

  v_entry_fee := v_match.entry_fee;
  v_team_size := COALESCE(v_match.team_size, 1);
  v_total_pool := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pool * 0.10;
  v_prize_pool := v_total_pool - v_platform_fee;

  -- ========================
  -- REFUND_BOTH: Full refund to all payers
  -- ========================
  IF p_action = 'REFUND_BOTH' THEN
    -- Check if already refunded
    IF EXISTS (SELECT 1 FROM transactions WHERE match_id = p_match_id AND type = 'refund') THEN
      RETURN jsonb_build_object('success', true, 'already_refunded', true);
    END IF;

    -- Refund Team A (Host)
    IF COALESCE(v_match.payment_mode_host, 'cover') = 'cover' THEN
      -- Cover mode: refund to single payer
      IF v_match.host_payer_user_id IS NOT NULL THEN
        v_amount_to_unlock := v_entry_fee * v_team_size;
        
        UPDATE wallets SET
          locked_balance = GREATEST(0, locked_balance - v_amount_to_unlock),
          balance = balance + v_amount_to_unlock
        WHERE user_id = v_match.host_payer_user_id;

        INSERT INTO transactions (user_id, match_id, type, amount, description)
        VALUES (v_match.host_payer_user_id, p_match_id, 'refund', v_amount_to_unlock, 'Admin refund: ' || COALESCE(p_notes, 'match cancelled'));

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_amount_to_unlock;
      END IF;
    ELSE
      -- Split mode: refund each participant
      FOR v_participant IN
        SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = 'A'
      LOOP
        UPDATE wallets SET
          locked_balance = GREATEST(0, locked_balance - v_entry_fee),
          balance = balance + v_entry_fee
        WHERE user_id = v_participant.user_id;

        INSERT INTO transactions (user_id, match_id, type, amount, description)
        VALUES (v_participant.user_id, p_match_id, 'refund', v_entry_fee, 'Admin refund: ' || COALESCE(p_notes, 'match cancelled'));

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_entry_fee;
      END LOOP;
    END IF;

    -- Refund Team B (Joiner)
    IF COALESCE(v_match.payment_mode_joiner, 'cover') = 'cover' THEN
      IF v_match.joiner_payer_user_id IS NOT NULL THEN
        v_amount_to_unlock := v_entry_fee * v_team_size;
        
        UPDATE wallets SET
          locked_balance = GREATEST(0, locked_balance - v_amount_to_unlock),
          balance = balance + v_amount_to_unlock
        WHERE user_id = v_match.joiner_payer_user_id;

        INSERT INTO transactions (user_id, match_id, type, amount, description)
        VALUES (v_match.joiner_payer_user_id, p_match_id, 'refund', v_amount_to_unlock, 'Admin refund: ' || COALESCE(p_notes, 'match cancelled'));

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_amount_to_unlock;
      END IF;
    ELSE
      FOR v_participant IN
        SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = 'B'
      LOOP
        UPDATE wallets SET
          locked_balance = GREATEST(0, locked_balance - v_entry_fee),
          balance = balance + v_entry_fee
        WHERE user_id = v_participant.user_id;

        INSERT INTO transactions (user_id, match_id, type, amount, description)
        VALUES (v_participant.user_id, p_match_id, 'refund', v_entry_fee, 'Admin refund: ' || COALESCE(p_notes, 'match cancelled'));

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_entry_fee;
      END LOOP;
    END IF;

    -- Update match status
    UPDATE matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;

    -- Update match result with admin notes
    INSERT INTO match_results (match_id, status, admin_notes, resolved_by)
    VALUES (p_match_id, 'resolved', 'REFUND: ' || COALESCE(p_notes, 'Admin cancelled match'), auth.uid())
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'resolved',
      admin_notes = 'REFUND: ' || COALESCE(p_notes, 'Admin cancelled match'),
      resolved_by = auth.uid(),
      updated_at = now();

    -- Log admin action
    INSERT INTO admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
    VALUES (auth.uid(), 'resolve_match', 'match', p_match_id, 
      jsonb_build_object('action', 'REFUND_BOTH', 'notes', p_notes, 'refunded', v_total_refunded));

    RETURN jsonb_build_object(
      'success', true,
      'action', 'REFUND_BOTH',
      'refund_count', v_refund_count,
      'total_refunded', v_total_refunded
    );
  END IF;

  -- ========================
  -- WIN/LOSS: Award prize to winner, deduct from loser
  -- ========================
  v_winner_side := CASE WHEN p_action = 'TEAM_A_WIN' THEN 'A' ELSE 'B' END;
  v_loser_side := CASE WHEN v_winner_side = 'A' THEN 'B' ELSE 'A' END;

  -- Determine payment modes
  v_winner_payment_mode := CASE WHEN v_winner_side = 'A' 
    THEN COALESCE(v_match.payment_mode_host, 'cover') 
    ELSE COALESCE(v_match.payment_mode_joiner, 'cover') 
  END;
  v_loser_payment_mode := CASE WHEN v_loser_side = 'A' 
    THEN COALESCE(v_match.payment_mode_host, 'cover') 
    ELSE COALESCE(v_match.payment_mode_joiner, 'cover') 
  END;

  -- Get payer IDs
  v_winner_payer_user_id := CASE WHEN v_winner_side = 'A' 
    THEN v_match.host_payer_user_id 
    ELSE v_match.joiner_payer_user_id 
  END;
  v_loser_payer_user_id := CASE WHEN v_loser_side = 'A' 
    THEN v_match.host_payer_user_id 
    ELSE v_match.joiner_payer_user_id 
  END;

  -- ========================
  -- Step 1: Unlock loser's funds (fee transaction)
  -- ========================
  IF v_loser_payment_mode = 'cover' THEN
    IF v_loser_payer_user_id IS NOT NULL THEN
      v_amount_to_unlock := v_entry_fee * v_team_size;
      UPDATE wallets SET locked_balance = GREATEST(0, locked_balance - v_amount_to_unlock)
      WHERE user_id = v_loser_payer_user_id;

      INSERT INTO transactions (user_id, match_id, type, amount, description)
      VALUES (v_loser_payer_user_id, p_match_id, 'fee', v_amount_to_unlock, 'Match lost - entry fee');
    END IF;
  ELSE
    -- Split mode: unlock from each loser participant
    FOR v_participant IN
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = v_loser_side
    LOOP
      UPDATE wallets SET locked_balance = GREATEST(0, locked_balance - v_entry_fee)
      WHERE user_id = v_participant.user_id;

      INSERT INTO transactions (user_id, match_id, type, amount, description)
      VALUES (v_participant.user_id, p_match_id, 'fee', v_entry_fee, 'Match lost - entry fee');
    END LOOP;
  END IF;

  -- ========================
  -- Step 2: Unlock winner's funds (they get them back + prize)
  -- ========================
  IF v_winner_payment_mode = 'cover' THEN
    IF v_winner_payer_user_id IS NOT NULL THEN
      v_amount_to_unlock := v_entry_fee * v_team_size;
      -- Unlock their stake and add prize
      UPDATE wallets SET 
        locked_balance = GREATEST(0, locked_balance - v_amount_to_unlock),
        balance = balance + v_prize_pool
      WHERE user_id = v_winner_payer_user_id;

      INSERT INTO transactions (user_id, match_id, type, amount, description)
      VALUES (v_winner_payer_user_id, p_match_id, 'payout', v_prize_pool, 'Match won - prize pool');
    END IF;
  ELSE
    -- Split mode: unlock and distribute prize equally
    v_payout_per_member := v_prize_pool / v_team_size;
    
    FOR v_participant IN
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = v_winner_side
    LOOP
      UPDATE wallets SET 
        locked_balance = GREATEST(0, locked_balance - v_entry_fee),
        balance = balance + v_payout_per_member
      WHERE user_id = v_participant.user_id;

      INSERT INTO transactions (user_id, match_id, type, amount, description)
      VALUES (v_participant.user_id, p_match_id, 'payout', v_payout_per_member, 'Match won - prize share');
    END LOOP;
  END IF;

  -- ========================
  -- Step 3: Record platform fee
  -- ========================
  INSERT INTO platform_earnings (match_id, amount)
  VALUES (p_match_id, v_platform_fee);

  -- ========================
  -- Step 4: Update match and result
  -- ========================
  UPDATE matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;

  INSERT INTO match_results (match_id, status, admin_notes, resolved_by, winner_team_id)
  VALUES (
    p_match_id, 
    'resolved', 
    p_action || ': ' || COALESCE(p_notes, ''),
    auth.uid(),
    CASE WHEN v_winner_side = 'A' THEN v_match.team_a_id ELSE v_match.team_b_id END
  )
  ON CONFLICT (match_id) DO UPDATE SET
    status = 'resolved',
    admin_notes = p_action || ': ' || COALESCE(p_notes, ''),
    resolved_by = auth.uid(),
    winner_team_id = CASE WHEN v_winner_side = 'A' THEN v_match.team_a_id ELSE v_match.team_b_id END,
    updated_at = now();

  -- Log admin action
  INSERT INTO admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'resolve_match', 'match', p_match_id, 
    jsonb_build_object(
      'action', p_action, 
      'notes', p_notes, 
      'prize_pool', v_prize_pool,
      'platform_fee', v_platform_fee,
      'winner_side', v_winner_side
    ));

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'winner_side', v_winner_side,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee
  );
END;
$$;

-- =============================================================
-- FUNCTION: auto_refund_expired_matches
-- Automatically refunds matches expired for more than 30 minutes
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_refund_expired_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_count INT := 0;
  v_total_refunded NUMERIC := 0;
  v_result jsonb;
BEGIN
  FOR v_match IN
    SELECT m.*
    FROM matches m
    WHERE m.status = 'expired'
      -- Expired more than 30 minutes ago
      AND COALESCE(m.finished_at, m.created_at) < now() - interval '30 minutes'
      -- Has lock transactions (funds were actually locked)
      AND EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.match_id = m.id AND t.type = 'lock'
      )
      -- Does NOT have refund transactions yet
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.match_id = m.id AND t.type = 'refund'
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Use existing admin_force_expire_match which handles all cases
      SELECT public.admin_force_expire_match(v_match.id, 'auto_refund_expired_after_30m') INTO v_result;
      
      IF (v_result->>'success')::boolean THEN
        v_count := v_count + 1;
        v_total_refunded := v_total_refunded + COALESCE((v_result->>'refunded_total')::numeric, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue processing other matches
      RAISE WARNING 'auto_refund_expired_matches: Failed to process match %: %', v_match.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_count,
    'total_refunded', v_total_refunded,
    'processed_at', now()
  );
END;
$$;

-- =============================================================
-- FUNCTION: get_admin_issue_stats (UPDATED)
-- Fixed: expired_with_locks now correctly counts matches with lock but no refund
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_admin_issue_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disputed INT;
  v_expired_with_locks INT;
  v_stuck_ready_check INT;
  v_inconsistent_results INT;
  v_total INT;
BEGIN
  -- Disputed matches
  SELECT COUNT(*) INTO v_disputed
  FROM matches WHERE status = 'disputed';

  -- Expired matches with funds still locked (has lock tx but no refund tx)
  SELECT COUNT(DISTINCT m.id) INTO v_expired_with_locks
  FROM matches m
  WHERE m.status = 'expired'
    AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.match_id = m.id AND t.type = 'lock'
    )
    AND NOT EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.match_id = m.id AND t.type = 'refund'
    );

  -- Stuck ready check (>10 minutes without starting)
  SELECT COUNT(*) INTO v_stuck_ready_check
  FROM matches
  WHERE status = 'ready_check'
    AND started_at IS NULL
    AND ready_check_at < now() - interval '10 minutes';

  -- Inconsistent results (both teams declared same result)
  SELECT COUNT(DISTINCT m.id) INTO v_inconsistent_results
  FROM matches m
  JOIN match_participants mp_a ON mp_a.match_id = m.id AND mp_a.team_side = 'A' AND mp_a.result_choice IS NOT NULL
  JOIN match_participants mp_b ON mp_b.match_id = m.id AND mp_b.team_side = 'B' AND mp_b.result_choice IS NOT NULL
  WHERE m.status IN ('result_pending', 'finished')
    AND mp_a.result_choice = mp_b.result_choice;

  v_total := v_disputed + v_expired_with_locks + v_stuck_ready_check + v_inconsistent_results;

  RETURN jsonb_build_object(
    'disputed', v_disputed,
    'expired_with_locks', v_expired_with_locks,
    'stuck_ready_check', v_stuck_ready_check,
    'inconsistent_results', v_inconsistent_results,
    'total', v_total
  );
END;
$$;

-- =============================================================
-- FUNCTION: admin_fix_orphan_locked_balance
-- One-time repair for users with locked_balance but no active matches
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_fix_orphan_locked_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
  v_orphan_amount NUMERIC;
  v_fixed_count INT := 0;
  v_fixed_users UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Find wallets with locked balance but no active matches
  FOR v_wallet IN
    SELECT w.user_id, w.locked_balance, w.balance
    FROM wallets w
    WHERE w.locked_balance > 0
      AND NOT EXISTS (
        SELECT 1 FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = w.user_id
        AND m.status NOT IN ('finished', 'completed', 'admin_resolved', 'expired', 'canceled')
      )
    FOR UPDATE
  LOOP
    -- Calculate what should be unlocked by checking transaction history
    -- Sum of locks minus sum of (refunds + fees + payouts received)
    SELECT GREATEST(0, 
      COALESCE(SUM(CASE WHEN t.type = 'lock' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type IN ('refund', 'fee') THEN t.amount ELSE 0 END), 0)
    )
    INTO v_orphan_amount
    FROM transactions t
    WHERE t.user_id = v_wallet.user_id
      AND t.match_id IS NOT NULL;

    -- Only fix if calculated orphan matches actual locked balance
    IF v_orphan_amount > 0 AND v_orphan_amount <= v_wallet.locked_balance THEN
      UPDATE wallets
      SET locked_balance = locked_balance - v_orphan_amount,
          balance = balance + v_orphan_amount
      WHERE user_id = v_wallet.user_id;

      INSERT INTO transactions (user_id, type, amount, description)
      VALUES (v_wallet.user_id, 'refund', v_orphan_amount, 'Admin fix: orphan locked balance restored');

      v_fixed_count := v_fixed_count + 1;
      v_fixed_users := array_append(v_fixed_users, v_wallet.user_id);
    END IF;
  END LOOP;

  -- Log admin action
  IF v_fixed_count > 0 THEN
    INSERT INTO admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
    VALUES (auth.uid(), 'fix_orphan_balance', 'system', NULL, 
      jsonb_build_object('fixed_count', v_fixed_count, 'fixed_users', v_fixed_users));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fixed_wallets', v_fixed_count,
    'fixed_users', v_fixed_users
  );
END;
$$;