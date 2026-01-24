-- ============================================================
-- PHASE 1: admin_purge_legacy_match - Process single legacy match
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_purge_legacy_match(p_match_id uuid, p_reason text DEFAULT 'legacy cleanup')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_lock_tx RECORD;
  v_payers uuid[];
  v_payer_id uuid;
  v_refunded_count int := 0;
  v_refunded_total numeric := 0;
  v_already_refunded boolean := false;
  v_wallet RECORD;
BEGIN
  -- Admin check
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Check if already has payout (match was properly resolved)
  IF EXISTS (SELECT 1 FROM transactions WHERE match_id = p_match_id AND type = 'payout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_already_paid_out', 'match_id', p_match_id);
  END IF;

  -- Find all unique payers from lock transactions for this match
  SELECT array_agg(DISTINCT user_id) INTO v_payers
  FROM transactions
  WHERE match_id = p_match_id AND type = 'lock';

  IF v_payers IS NULL OR array_length(v_payers, 1) = 0 THEN
    -- No locks found, nothing to refund
    -- Just update status if needed
    IF v_match.status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved') THEN
      UPDATE matches SET status = 'expired', finished_at = now() WHERE id = p_match_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'no_locks_found', 'match_id', p_match_id);
  END IF;

  -- Process each payer
  FOREACH v_payer_id IN ARRAY v_payers
  LOOP
    -- Check if this payer already got a refund for this match
    IF EXISTS (
      SELECT 1 FROM transactions 
      WHERE match_id = p_match_id 
        AND user_id = v_payer_id 
        AND type = 'refund'
    ) THEN
      CONTINUE; -- Skip, already refunded
    END IF;

    -- Calculate total locked by this payer for this match
    SELECT COALESCE(SUM(amount), 0) INTO v_lock_tx.amount
    FROM transactions
    WHERE match_id = p_match_id 
      AND user_id = v_payer_id 
      AND type = 'lock';

    IF v_lock_tx.amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Lock wallet and update balances
    SELECT * INTO v_wallet FROM wallets WHERE user_id = v_payer_id FOR UPDATE;
    
    IF v_wallet IS NULL THEN
      CONTINUE;
    END IF;

    -- Decrease locked_balance (clamped to 0)
    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_lock_tx.amount),
        balance = balance + v_lock_tx.amount,
        updated_at = now()
    WHERE user_id = v_payer_id;

    -- Insert refund transaction
    INSERT INTO transactions (user_id, match_id, type, amount, description, status)
    VALUES (v_payer_id, p_match_id, 'refund', v_lock_tx.amount, 'Legacy cleanup: ' || p_reason, 'completed');

    v_refunded_count := v_refunded_count + 1;
    v_refunded_total := v_refunded_total + v_lock_tx.amount;
  END LOOP;

  -- Update match status to expired if not already terminal
  IF v_match.status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved') THEN
    UPDATE matches 
    SET status = 'expired', 
        finished_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'refunded_count', v_refunded_count,
    'refunded_total', v_refunded_total,
    'previous_status', v_match.status
  );
END;
$$;

-- ============================================================
-- PHASE 2: admin_cleanup_legacy_stuck_matches - Batch processing
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_cleanup_legacy_stuck_matches(p_cutoff_minutes int DEFAULT 35)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_result jsonb;
  v_processed_ids uuid[] := ARRAY[]::uuid[];
  v_non_terminal_count int := 0;
  v_terminal_stuck_count int := 0;
  v_total_refunded numeric := 0;
  v_auto_refund_result jsonb;
  v_orphan_result jsonb;
BEGIN
  -- Admin check
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- STEP 1: Process non-terminal matches that are old and have locks without refunds
  FOR v_match IN
    SELECT DISTINCT m.id, m.status, m.created_at
    FROM matches m
    WHERE m.status IN ('open', 'joined', 'full', 'ready_check', 'in_progress', 'result_pending', 'disputed')
      AND m.created_at < now() - (p_cutoff_minutes || ' minutes')::interval
      -- Has lock transactions
      AND EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'lock'
      )
      -- Does NOT have payout (not properly resolved)
      AND NOT EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'payout'
      )
    ORDER BY m.created_at ASC
    LIMIT 100 -- Safety limit
  LOOP
    SELECT admin_purge_legacy_match(v_match.id, 'auto-expire non-terminal legacy') INTO v_result;
    IF (v_result->>'success')::boolean THEN
      v_processed_ids := array_append(v_processed_ids, v_match.id);
      v_non_terminal_count := v_non_terminal_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_result->>'refunded_total')::numeric, 0);
    END IF;
  END LOOP;

  -- STEP 2: Process terminal matches that still have stuck funds (lock without refund/payout)
  FOR v_match IN
    SELECT DISTINCT m.id, m.status
    FROM matches m
    WHERE m.status IN ('finished', 'expired', 'canceled', 'admin_resolved')
      -- Has lock transactions
      AND EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'lock'
      )
      -- Does NOT have payout
      AND NOT EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'payout'
      )
      -- Does NOT have refund for ALL payers (check if any payer is missing refund)
      AND EXISTS (
        SELECT 1 FROM transactions t_lock
        WHERE t_lock.match_id = m.id AND t_lock.type = 'lock'
          AND NOT EXISTS (
            SELECT 1 FROM transactions t_ref
            WHERE t_ref.match_id = m.id 
              AND t_ref.user_id = t_lock.user_id 
              AND t_ref.type = 'refund'
          )
      )
    ORDER BY m.created_at ASC
    LIMIT 100 -- Safety limit
  LOOP
    SELECT admin_purge_legacy_match(v_match.id, 'cleanup terminal with stuck funds') INTO v_result;
    IF (v_result->>'success')::boolean THEN
      v_processed_ids := array_append(v_processed_ids, v_match.id);
      v_terminal_stuck_count := v_terminal_stuck_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_result->>'refunded_total')::numeric, 0);
    END IF;
  END LOOP;

  -- STEP 3: Run auto_refund_expired_matches for standard expired cleanup
  SELECT auto_refund_expired_matches() INTO v_auto_refund_result;

  -- STEP 4: Fix orphan locked balances (locks with no match_id or inconsistent state)
  SELECT admin_fix_orphan_locked_balance() INTO v_orphan_result;

  RETURN jsonb_build_object(
    'success', true,
    'non_terminal_processed', v_non_terminal_count,
    'terminal_stuck_processed', v_terminal_stuck_count,
    'total_matches_processed', v_non_terminal_count + v_terminal_stuck_count,
    'total_refunded', v_total_refunded,
    'processed_match_ids', v_processed_ids[1:10], -- First 10 for display
    'auto_refund_result', v_auto_refund_result,
    'orphan_fix_result', v_orphan_result
  );
END;
$$;

-- ============================================================
-- PHASE 3: Improved admin_fix_orphan_locked_balance
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_fix_orphan_locked_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
  v_sum_locks numeric;
  v_sum_unlocks numeric;
  v_orphan_amount numeric;
  v_fixed_count int := 0;
  v_fixed_total numeric := 0;
BEGIN
  -- Admin check
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Find wallets with locked_balance > 0 but no active matches
  FOR v_wallet IN
    SELECT w.user_id, w.locked_balance, w.balance
    FROM wallets w
    WHERE w.locked_balance > 0
      -- User has NO active matches
      AND NOT EXISTS (
        SELECT 1 FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = w.user_id
        AND m.status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved')
      )
    FOR UPDATE OF w
  LOOP
    -- Calculate: sum of all locks - sum of all (refunds + fees + payouts)
    -- For this user across ALL matches (including those with NULL match_id)
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'lock' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type IN ('refund', 'fee', 'payout') THEN amount ELSE 0 END), 0)
    INTO v_sum_locks, v_sum_unlocks
    FROM transactions
    WHERE user_id = v_wallet.user_id;

    -- Calculate orphan amount (locks that were never "consumed")
    v_orphan_amount := v_sum_locks - v_sum_unlocks;

    -- Only fix if orphan amount matches locked_balance (sanity check)
    -- OR if locked_balance is positive but orphan calculation is off (use locked_balance)
    IF v_orphan_amount > 0 THEN
      -- Use the smaller of orphan_amount or locked_balance to be conservative
      v_orphan_amount := LEAST(v_orphan_amount, v_wallet.locked_balance);
    ELSIF v_wallet.locked_balance > 0 THEN
      -- locked_balance is positive but ledger says 0 orphan - trust locked_balance
      v_orphan_amount := v_wallet.locked_balance;
    ELSE
      CONTINUE;
    END IF;

    IF v_orphan_amount > 0 THEN
      -- Restore orphan balance
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_orphan_amount),
          balance = balance + v_orphan_amount,
          updated_at = now()
      WHERE user_id = v_wallet.user_id;

      -- Create reconciliation transaction
      INSERT INTO transactions (user_id, type, amount, description, status)
      VALUES (
        v_wallet.user_id, 
        'refund', 
        v_orphan_amount, 
        'Admin fix: orphan locked balance restored',
        'completed'
      );

      v_fixed_count := v_fixed_count + 1;
      v_fixed_total := v_fixed_total + v_orphan_amount;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'fixed_wallets', v_fixed_count,
    'fixed_total', v_fixed_total
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_purge_legacy_match(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_legacy_stuck_matches(int) TO authenticated;