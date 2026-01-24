-- =============================================================================
-- FIX DEFINITIVO: Legacy Match Cleanup + Wallet Repair
-- Risolve: "record v_lock_tx is not assigned yet" + auth inconsistencies
-- =============================================================================

-- 1. ADMIN_PURGE_LEGACY_MATCH - RISCRITTA con variabili SCALARI (no RECORD problematici)
CREATE OR REPLACE FUNCTION public.admin_purge_legacy_match(p_match_id uuid, p_reason text DEFAULT 'legacy cleanup')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_status text;
  v_match_created_at timestamptz;
  v_payer_id uuid;
  v_payers uuid[];
  v_lock_amount numeric;          -- SCALAR invece di RECORD
  v_refund_exists boolean;
  v_refunded_count int := 0;
  v_refunded_total numeric := 0;
BEGIN
  -- Admin check (SINGLE SOURCE OF TRUTH: user_roles)
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock match row and get status (usando variabili scalari)
  SELECT status, created_at INTO v_match_status, v_match_created_at
  FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Skip if already has payout (idempotenza)
  IF EXISTS (SELECT 1 FROM transactions WHERE match_id = p_match_id AND type = 'payout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_already_paid_out', 'match_id', p_match_id);
  END IF;

  -- Find all unique payers from lock transactions
  SELECT array_agg(DISTINCT user_id) INTO v_payers
  FROM transactions
  WHERE match_id = p_match_id AND type = 'lock';

  IF v_payers IS NULL OR array_length(v_payers, 1) = 0 THEN
    -- No locks found, just update status if needed
    IF v_match_status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved') THEN
      UPDATE matches SET status = 'expired', finished_at = now() WHERE id = p_match_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'no_locks_found', 'match_id', p_match_id);
  END IF;

  -- Process each payer (handles 1v1 AND team matches correctly)
  FOREACH v_payer_id IN ARRAY v_payers
  LOOP
    -- Check if already refunded for this match (idempotenza)
    SELECT EXISTS (
      SELECT 1 FROM transactions 
      WHERE match_id = p_match_id AND user_id = v_payer_id AND type = 'refund'
    ) INTO v_refund_exists;

    IF v_refund_exists THEN
      CONTINUE; -- Skip, already refunded
    END IF;

    -- Calculate total lock amount for this user (VARIABILE SCALARE!)
    SELECT COALESCE(SUM(amount), 0) INTO v_lock_amount
    FROM transactions
    WHERE match_id = p_match_id AND user_id = v_payer_id AND type = 'lock';

    IF v_lock_amount <= 0 THEN
      CONTINUE; -- Nothing to refund
    END IF;

    -- Update wallet: restore locked funds to available balance
    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_lock_amount),
        balance = balance + v_lock_amount,
        updated_at = now()
    WHERE user_id = v_payer_id;

    -- Create refund transaction (idempotent by design - one per user per match)
    INSERT INTO transactions (user_id, match_id, type, amount, description, status)
    VALUES (v_payer_id, p_match_id, 'refund', v_lock_amount, 'Legacy cleanup: ' || p_reason, 'completed');

    v_refunded_count := v_refunded_count + 1;
    v_refunded_total := v_refunded_total + v_lock_amount;
  END LOOP;

  -- Update match status if not already terminal
  IF v_match_status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved') THEN
    UPDATE matches SET status = 'expired', finished_at = now() WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'refunded_count', v_refunded_count,
    'total_refunded', v_refunded_total,
    'previous_status', v_match_status
  );
END;
$$;

-- 2. ADMIN_CLEANUP_LEGACY_STUCK_MATCHES - Consolidata e robusta
CREATE OR REPLACE FUNCTION public.admin_cleanup_legacy_stuck_matches(p_cutoff_minutes integer DEFAULT 35)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_match_status text;
  v_purge_result jsonb;
  v_non_terminal_count int := 0;
  v_terminal_stuck_count int := 0;
  v_total_refunded numeric := 0;
  v_processed_ids uuid[] := ARRAY[]::uuid[];
  v_orphan_result jsonb;
BEGIN
  -- Admin check (SINGLE SOURCE OF TRUTH: user_roles via is_admin())
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- STEP 1: Process non-terminal matches older than cutoff
  FOR v_match_id, v_match_status IN
    SELECT m.id, m.status
    FROM matches m
    WHERE m.status IN ('open', 'joined', 'full', 'ready_check', 'in_progress', 'result_pending', 'disputed')
      AND m.created_at < now() - (p_cutoff_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM transactions t WHERE t.match_id = m.id AND t.type = 'lock')
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.match_id = m.id AND t.type = 'payout')
    ORDER BY m.created_at ASC
    LIMIT 100
  LOOP
    v_purge_result := public.admin_purge_legacy_match(v_match_id, 'auto-expire non-terminal');
    IF (v_purge_result->>'success')::boolean THEN
      v_non_terminal_count := v_non_terminal_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_purge_result->>'total_refunded')::numeric, 0);
      v_processed_ids := array_append(v_processed_ids, v_match_id);
    END IF;
  END LOOP;

  -- STEP 2: Process terminal matches with stuck funds (lock without refund)
  FOR v_match_id, v_match_status IN
    SELECT m.id, m.status
    FROM matches m
    WHERE m.status IN ('finished', 'expired', 'canceled', 'admin_resolved')
      AND EXISTS (SELECT 1 FROM transactions t WHERE t.match_id = m.id AND t.type = 'lock')
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.match_id = m.id AND t.type = 'payout')
      AND EXISTS (
        SELECT 1 FROM transactions t_lock
        WHERE t_lock.match_id = m.id AND t_lock.type = 'lock'
          AND NOT EXISTS (
            SELECT 1 FROM transactions t_ref
            WHERE t_ref.match_id = m.id AND t_ref.user_id = t_lock.user_id AND t_ref.type = 'refund'
          )
      )
    ORDER BY m.created_at ASC
    LIMIT 100
  LOOP
    v_purge_result := public.admin_purge_legacy_match(v_match_id, 'cleanup terminal stuck');
    IF (v_purge_result->>'success')::boolean THEN
      v_terminal_stuck_count := v_terminal_stuck_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_purge_result->>'total_refunded')::numeric, 0);
      v_processed_ids := array_append(v_processed_ids, v_match_id);
    END IF;
  END LOOP;

  -- STEP 3: Standard expired refunds
  PERFORM public.auto_refund_expired_matches();

  -- STEP 4: Fix orphan locked balances
  v_orphan_result := public.admin_fix_orphan_locked_balance();

  RETURN jsonb_build_object(
    'success', true,
    'non_terminal_processed', v_non_terminal_count,
    'terminal_stuck_processed', v_terminal_stuck_count,
    'total_matches_processed', v_non_terminal_count + v_terminal_stuck_count,
    'total_refunded', v_total_refunded,
    'processed_match_ids', v_processed_ids[1:10],
    'orphan_fix_result', v_orphan_result,
    'executed_at', now()
  );
END;
$$;

-- 3. ADMIN_FIX_ORPHAN_LOCKED_BALANCE - Migliorata con variabili scalari
CREATE OR REPLACE FUNCTION public.admin_fix_orphan_locked_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_wallet_locked numeric;
  v_wallet_balance numeric;
  v_net_locked numeric;
  v_orphan_amount numeric;
  v_fixed_count int := 0;
  v_fixed_total numeric := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Find wallets with locked_balance > 0 but no active matches
  FOR v_user_id, v_wallet_locked, v_wallet_balance IN
    SELECT w.user_id, w.locked_balance, w.balance
    FROM wallets w
    WHERE w.locked_balance > 0
      AND NOT EXISTS (
        SELECT 1 FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = w.user_id
        AND m.status NOT IN ('finished', 'expired', 'canceled', 'admin_resolved')
      )
    FOR UPDATE OF w
  LOOP
    -- Calculate net locked from transaction ledger
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'lock' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN type IN ('refund', 'fee', 'payout') THEN amount ELSE 0 END), 0)
    INTO v_net_locked
    FROM transactions
    WHERE user_id = v_user_id;

    -- Determine orphan amount
    IF v_net_locked <= 0 AND v_wallet_locked > 0 THEN
      v_orphan_amount := v_wallet_locked;
    ELSIF v_net_locked > 0 AND v_net_locked < v_wallet_locked THEN
      v_orphan_amount := v_wallet_locked - v_net_locked;
    ELSE
      CONTINUE;
    END IF;

    IF v_orphan_amount > 0 THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_orphan_amount),
          balance = balance + v_orphan_amount,
          updated_at = now()
      WHERE user_id = v_user_id;

      INSERT INTO transactions (user_id, type, amount, description, status)
      VALUES (v_user_id, 'refund', v_orphan_amount, 'Admin fix: orphan locked balance restored', 'completed');

      v_fixed_count := v_fixed_count + 1;
      v_fixed_total := v_fixed_total + v_orphan_amount;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'fixed_wallets', v_fixed_count, 'fixed_total', v_fixed_total);
END;
$$;

-- 4. NUOVA: admin_recalculate_wallet_locked_balance - Riconciliazione completa
CREATE OR REPLACE FUNCTION public.admin_recalculate_wallet_locked_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_current_locked numeric;
  v_expected_locked numeric;
  v_diff numeric;
  v_fixed_count int := 0;
  v_fixed_total numeric := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  FOR v_user_id, v_current_locked IN
    SELECT user_id, locked_balance FROM wallets FOR UPDATE
  LOOP
    -- Calculate expected locked from ledger
    SELECT GREATEST(0,
      COALESCE(SUM(CASE WHEN type = 'lock' THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN type IN ('refund', 'fee', 'payout') THEN amount ELSE 0 END), 0)
    ) INTO v_expected_locked
    FROM transactions
    WHERE user_id = v_user_id;

    v_diff := v_current_locked - v_expected_locked;

    IF v_diff <> 0 THEN
      UPDATE wallets
      SET locked_balance = v_expected_locked,
          balance = balance + v_diff,
          updated_at = now()
      WHERE user_id = v_user_id;

      IF v_diff > 0 THEN
        INSERT INTO transactions (user_id, type, amount, description, status)
        VALUES (v_user_id, 'refund', v_diff, 'Admin recalculation: locked balance reconciled', 'completed');
      END IF;

      v_fixed_count := v_fixed_count + 1;
      v_fixed_total := v_fixed_total + ABS(v_diff);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'wallets_reconciled', v_fixed_count, 'total_adjusted', v_fixed_total);
END;
$$;

-- 5. GRANT permissions
GRANT EXECUTE ON FUNCTION public.admin_purge_legacy_match(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_legacy_stuck_matches(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fix_orphan_locked_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_wallet_locked_balance() TO authenticated;