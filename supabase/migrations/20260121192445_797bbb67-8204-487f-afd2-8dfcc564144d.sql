-- Admin-only legacy cleanup: purge an impossible/legacy match safely while keeping transactions

CREATE OR REPLACE FUNCTION public.admin_purge_legacy_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_match record;

  v_user_id uuid;
  v_lock_sum numeric;
  v_refund_unlock_sum numeric;
  v_delta numeric;
  v_wallet_locked numeric;
  v_wallet_balance numeric;
  v_refund_amount numeric;

  v_deleted_participants integer := 0;
  v_deleted_results integer := 0;
  v_deleted_proofs integer := 0;
  v_deleted_chat integer := 0;
  v_deleted_match integer := 0;

  v_refunds jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- Admin gate
  SELECT public.is_admin() INTO v_is_admin;
  IF COALESCE(v_is_admin, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Lock + validate match
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'not_found');
  END IF;

  IF v_match.status IS DISTINCT FROM 'expired' THEN
    RETURN jsonb_build_object(
      'match_id', p_match_id,
      'status', 'skipped',
      'reason', 'match_not_expired',
      'match_status', v_match.status
    );
  END IF;

  -- Safety: only allow purging older matches (prevents touching new flows accidentally)
  IF v_match.created_at > (now() - interval '6 hours') THEN
    RETURN jsonb_build_object(
      'match_id', p_match_id,
      'status', 'skipped',
      'reason', 'too_recent',
      'created_at', v_match.created_at
    );
  END IF;

  -- Refund any missing locked funds per user (cap to wallet.locked_balance to avoid negative)
  FOR v_user_id IN
    (SELECT DISTINCT user_id FROM public.transactions WHERE match_id = p_match_id)
  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN type = 'lock' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type IN ('refund','unlock') THEN amount ELSE 0 END), 0)
    INTO v_lock_sum, v_refund_unlock_sum
    FROM public.transactions
    WHERE match_id = p_match_id
      AND user_id = v_user_id
      AND status = 'completed';

    v_delta := v_lock_sum - v_refund_unlock_sum;

    IF v_delta > 0 THEN
      -- Lock wallet row
      SELECT balance, locked_balance
      INTO v_wallet_balance, v_wallet_locked
      FROM public.wallets
      WHERE user_id = v_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        v_warnings := v_warnings || jsonb_build_array(
          jsonb_build_object('type','missing_wallet','user_id',v_user_id,'delta',v_delta)
        );
      ELSE
        v_refund_amount := LEAST(v_delta, COALESCE(v_wallet_locked, 0));

        IF v_refund_amount <= 0 THEN
          v_warnings := v_warnings || jsonb_build_array(
            jsonb_build_object('type','locked_balance_too_low','user_id',v_user_id,'delta',v_delta,'wallet_locked',v_wallet_locked)
          );
        ELSE
          UPDATE public.wallets
          SET balance = balance + v_refund_amount,
              locked_balance = locked_balance - v_refund_amount,
              updated_at = now()
          WHERE user_id = v_user_id;

          INSERT INTO public.transactions (
            user_id,
            type,
            amount,
            status,
            match_id,
            provider,
            description,
            created_at
          ) VALUES (
            v_user_id,
            'refund',
            v_refund_amount,
            'completed',
            p_match_id,
            'internal',
            'Legacy cleanup refund (admin purge)',
            now()
          );

          v_refunds := v_refunds || jsonb_build_array(
            jsonb_build_object('user_id', v_user_id, 'refund_amount', v_refund_amount, 'delta_detected', v_delta)
          );

          IF v_refund_amount < v_delta THEN
            v_warnings := v_warnings || jsonb_build_array(
              jsonb_build_object(
                'type','refund_capped',
                'user_id',v_user_id,
                'delta_detected',v_delta,
                'refund_amount',v_refund_amount,
                'wallet_locked',v_wallet_locked
              )
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Delete operational match records (keep transactions)
  DELETE FROM public.match_results WHERE match_id = p_match_id;
  GET DIAGNOSTICS v_deleted_results = ROW_COUNT;

  DELETE FROM public.match_proofs WHERE match_id = p_match_id;
  GET DIAGNOSTICS v_deleted_proofs = ROW_COUNT;

  DELETE FROM public.match_chat_messages WHERE match_id = p_match_id;
  GET DIAGNOSTICS v_deleted_chat = ROW_COUNT;

  DELETE FROM public.match_participants WHERE match_id = p_match_id;
  GET DIAGNOSTICS v_deleted_participants = ROW_COUNT;

  DELETE FROM public.matches WHERE id = p_match_id;
  GET DIAGNOSTICS v_deleted_match = ROW_COUNT;

  -- Audit log (best-effort)
  BEGIN
    INSERT INTO public.admin_action_logs (admin_user_id, action_type, target_type, target_id, details, created_at)
    VALUES (
      auth.uid(),
      'purge_legacy_match',
      'match',
      p_match_id,
      jsonb_build_object(
        'refunds', v_refunds,
        'deleted', jsonb_build_object(
          'match', v_deleted_match,
          'participants', v_deleted_participants,
          'results', v_deleted_results,
          'proofs', v_deleted_proofs,
          'chat', v_deleted_chat
        ),
        'warnings', v_warnings
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- ignore audit failures
    NULL;
  END;

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'status', 'purged',
    'refunds', v_refunds,
    'deleted', jsonb_build_object(
      'match', v_deleted_match,
      'participants', v_deleted_participants,
      'results', v_deleted_results,
      'proofs', v_deleted_proofs,
      'chat', v_deleted_chat
    ),
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_legacy_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_legacy_match(uuid) TO authenticated;