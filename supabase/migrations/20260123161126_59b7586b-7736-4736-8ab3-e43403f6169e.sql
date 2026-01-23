-- 1) Enriched view for match chat messages (display ADMIN for admin senders)
CREATE OR REPLACE VIEW public.match_chat_messages_view AS
SELECT
  m.id,
  m.match_id,
  m.user_id,
  m.message,
  m.is_system,
  m.created_at,
  CASE
    WHEN public.has_role(m.user_id, 'admin'::public.app_role) THEN 'ADMIN'
    ELSE COALESCE(p.username, 'Unknown')
  END AS display_name,
  p.avatar_url
FROM public.match_chat_messages m
LEFT JOIN public.profiles_public p
  ON p.user_id = m.user_id;

-- 2) Admin force-expire RPC (idempotent, blocks in_progress, no payout)
CREATE OR REPLACE FUNCTION public.admin_force_expire_match(
  p_match_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_participant RECORD;
  v_refund_amount numeric;
  v_refunded_total numeric := 0;
  v_refund_count integer := 0;
  v_already_expired boolean := false;
  v_has_payout boolean := false;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Block in_progress per requisito
  IF v_match.status = 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'in_progress_blocked');
  END IF;

  -- If already settled (payout executed) OR terminal win state, reject
  SELECT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.match_id = p_match_id
      AND t.type = 'payout'
      AND COALESCE(t.status, 'completed') = 'completed'
  ) INTO v_has_payout;

  IF v_has_payout OR v_match.status IN ('completed', 'admin_resolved', 'finished') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_settled');
  END IF;

  v_already_expired := (v_match.status = 'expired');

  -- Refund logic (idempotent via transactions guard)
  IF v_match.team_size = 1 THEN
    FOR v_participant IN
      SELECT mp.user_id
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.match_id = p_match_id
          AND t.user_id = v_participant.user_id
          AND t.type = 'refund'
      ) THEN
        UPDATE public.wallets
        SET balance = balance + v_match.entry_fee,
            locked_balance = locked_balance - v_match.entry_fee
        WHERE user_id = v_participant.user_id
          AND locked_balance >= v_match.entry_fee;

        IF FOUND THEN
          INSERT INTO public.transactions (user_id, type, amount, match_id, description)
          VALUES (v_participant.user_id, 'refund', v_match.entry_fee, p_match_id, 'Match expired - admin force expire');
          v_refunded_total := v_refunded_total + v_match.entry_fee;
          v_refund_count := v_refund_count + 1;
        END IF;
      END IF;
    END LOOP;

  ELSE
    -- Team A (host)
    IF v_match.payment_mode_host = 'cover' THEN
      v_refund_amount := v_match.entry_fee * v_match.team_size;
      IF v_match.host_payer_user_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.match_id = p_match_id
            AND t.user_id = v_match.host_payer_user_id
            AND t.type = 'refund'
        ) THEN
          UPDATE public.wallets
          SET balance = balance + v_refund_amount,
              locked_balance = locked_balance - v_refund_amount
          WHERE user_id = v_match.host_payer_user_id
            AND locked_balance >= v_refund_amount;

          IF FOUND THEN
            INSERT INTO public.transactions (user_id, type, amount, match_id, description)
            VALUES (v_match.host_payer_user_id, 'refund', v_refund_amount, p_match_id, 'Match expired - admin force expire (host cover)');
            v_refunded_total := v_refunded_total + v_refund_amount;
            v_refund_count := v_refund_count + 1;
          END IF;
        END IF;
      END IF;
    ELSE
      FOR v_participant IN
        SELECT mp.user_id
        FROM public.match_participants mp
        WHERE mp.match_id = p_match_id
          AND mp.team_side = 'A'
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.match_id = p_match_id
            AND t.user_id = v_participant.user_id
            AND t.type = 'refund'
        ) THEN
          UPDATE public.wallets
          SET balance = balance + v_match.entry_fee,
              locked_balance = locked_balance - v_match.entry_fee
          WHERE user_id = v_participant.user_id
            AND locked_balance >= v_match.entry_fee;

          IF FOUND THEN
            INSERT INTO public.transactions (user_id, type, amount, match_id, description)
            VALUES (v_participant.user_id, 'refund', v_match.entry_fee, p_match_id, 'Match expired - admin force expire (host split)');
            v_refunded_total := v_refunded_total + v_match.entry_fee;
            v_refund_count := v_refund_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Team B (joiner)
    IF v_match.payment_mode_joiner = 'cover' THEN
      v_refund_amount := v_match.entry_fee * v_match.team_size;
      IF v_match.joiner_payer_user_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.match_id = p_match_id
            AND t.user_id = v_match.joiner_payer_user_id
            AND t.type = 'refund'
        ) THEN
          UPDATE public.wallets
          SET balance = balance + v_refund_amount,
              locked_balance = locked_balance - v_refund_amount
          WHERE user_id = v_match.joiner_payer_user_id
            AND locked_balance >= v_refund_amount;

          IF FOUND THEN
            INSERT INTO public.transactions (user_id, type, amount, match_id, description)
            VALUES (v_match.joiner_payer_user_id, 'refund', v_refund_amount, p_match_id, 'Match expired - admin force expire (joiner cover)');
            v_refunded_total := v_refunded_total + v_refund_amount;
            v_refund_count := v_refund_count + 1;
          END IF;
        END IF;
      END IF;
    ELSE
      FOR v_participant IN
        SELECT mp.user_id
        FROM public.match_participants mp
        WHERE mp.match_id = p_match_id
          AND mp.team_side = 'B'
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.match_id = p_match_id
            AND t.user_id = v_participant.user_id
            AND t.type = 'refund'
        ) THEN
          UPDATE public.wallets
          SET balance = balance + v_match.entry_fee,
              locked_balance = locked_balance - v_match.entry_fee
          WHERE user_id = v_participant.user_id
            AND locked_balance >= v_match.entry_fee;

          IF FOUND THEN
            INSERT INTO public.transactions (user_id, type, amount, match_id, description)
            VALUES (v_participant.user_id, 'refund', v_match.entry_fee, p_match_id, 'Match expired - admin force expire (joiner split)');
            v_refunded_total := v_refunded_total + v_match.entry_fee;
            v_refund_count := v_refund_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Update match status (archive/hide)
  UPDATE public.matches
  SET status = 'expired',
      finished_at = COALESCE(finished_at, now())
  WHERE id = p_match_id;

  -- Append admin note to match_results if present, else create a minimal row
  IF EXISTS (SELECT 1 FROM public.match_results r WHERE r.match_id = p_match_id) THEN
    UPDATE public.match_results
    SET admin_notes = COALESCE(admin_notes, '')
      || CASE WHEN COALESCE(admin_notes, '') = '' THEN '' ELSE E'\n' END
      || 'Force expire by admin at ' || now()::text
      || CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN E' — ' || p_reason ELSE '' END
    WHERE match_id = p_match_id;
  ELSE
    INSERT INTO public.match_results (match_id, admin_notes)
    VALUES (
      p_match_id,
      'Force expire by admin at ' || now()::text
      || CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN E' — ' || p_reason ELSE '' END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status', 'expired',
    'already_expired', v_already_expired,
    'refund_count', v_refund_count,
    'refunded_total', v_refunded_total
  );
END;
$$;