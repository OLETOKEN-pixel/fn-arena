-- Fix: Use correct is_admin() helper instead of broken profiles check
CREATE OR REPLACE FUNCTION public.admin_cleanup_legacy_stuck_matches(p_cutoff_minutes integer DEFAULT 35)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_purge_result jsonb;
  v_non_terminal_count int := 0;
  v_terminal_stuck_count int := 0;
  v_total_refunded numeric := 0;
  v_processed_ids uuid[] := ARRAY[]::uuid[];
  v_orphan_result jsonb;
BEGIN
  -- Verify caller is admin using the correct helper function
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- STEP 1: Process non-terminal matches older than cutoff
  -- These are matches stuck in active states that should have completed
  FOR v_match IN
    SELECT DISTINCT m.id, m.status, m.created_at
    FROM matches m
    WHERE m.status IN ('open', 'ready_check', 'in_progress', 'result_pending', 'disputed')
      AND m.created_at < now() - (p_cutoff_minutes || ' minutes')::interval
      -- Has lock transactions (funds were committed)
      AND EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'lock'
      )
      -- No payout yet (not already settled)
      AND NOT EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'payout'
      )
    ORDER BY m.created_at ASC
  LOOP
    -- Purge this legacy match
    v_purge_result := admin_purge_legacy_match(v_match.id, 'legacy cleanup auto-expire (non-terminal)');
    
    IF (v_purge_result->>'success')::boolean THEN
      v_non_terminal_count := v_non_terminal_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_purge_result->>'total_refunded')::numeric, 0);
      v_processed_ids := array_append(v_processed_ids, v_match.id);
    END IF;
  END LOOP;

  -- STEP 2: Process terminal matches that have stuck funds
  -- These are matches resolved with old code that didn't unlock properly
  FOR v_match IN
    SELECT DISTINCT m.id, m.status, m.created_at
    FROM matches m
    WHERE m.status IN ('finished', 'expired', 'canceled', 'admin_resolved')
      -- Has lock transactions
      AND EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'lock'
      )
      -- No payout (wasn't settled via winner)
      AND NOT EXISTS (
        SELECT 1 FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'payout'
      )
      -- Check if refunds are missing for some lock transactions
      AND (
        SELECT COUNT(DISTINCT t.user_id) 
        FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'lock'
      ) > (
        SELECT COUNT(DISTINCT t.user_id) 
        FROM transactions t 
        WHERE t.match_id = m.id AND t.type = 'refund'
      )
    ORDER BY m.created_at ASC
  LOOP
    -- Purge this legacy match
    v_purge_result := admin_purge_legacy_match(v_match.id, 'legacy cleanup (terminal with stuck funds)');
    
    IF (v_purge_result->>'success')::boolean THEN
      v_terminal_stuck_count := v_terminal_stuck_count + 1;
      v_total_refunded := v_total_refunded + COALESCE((v_purge_result->>'total_refunded')::numeric, 0);
      v_processed_ids := array_append(v_processed_ids, v_match.id);
    END IF;
  END LOOP;

  -- STEP 3: Run standard expired match refunds
  PERFORM auto_refund_expired_matches();

  -- STEP 4: Fix any orphan locked balances (lock transactions with no match_id or mismatched ledger)
  v_orphan_result := admin_fix_orphan_locked_balance();

  RETURN jsonb_build_object(
    'success', true,
    'non_terminal_processed', v_non_terminal_count,
    'terminal_stuck_processed', v_terminal_stuck_count,
    'total_refunded', v_total_refunded,
    'processed_match_ids', v_processed_ids,
    'orphan_fix_result', v_orphan_result,
    'executed_at', now()
  );
END;
$$;

-- Ensure authenticated users can call the function (admin check is inside)
GRANT EXECUTE ON FUNCTION public.admin_cleanup_legacy_stuck_matches(integer) TO authenticated;