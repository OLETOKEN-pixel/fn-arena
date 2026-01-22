-- Definitive minimal fix: automatic match expiration + ghost cleanup
-- Fixes ONLY: auto-expire + scheduler; no changes to create/join/ready/result/payout flows.

-- 1) Ensure scheduler extension exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Patch: READY_CHECK timeout + stronger idempotency guards (no schema changes)
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
  FOR v_match IN
    SELECT m.*
    FROM matches m
    WHERE m.status IN ('open', 'ready_check', 'joined', 'full')
      AND (
        (
          m.status IN ('open','joined','full')
          AND (
            (m.expires_at IS NOT NULL AND m.expires_at < now())
            OR (m.expires_at IS NULL AND m.created_at < now() - interval '30 minutes')
          )
        )
        OR (
          m.status = 'ready_check'
          AND m.started_at IS NULL
          AND (
            (m.ready_check_at IS NOT NULL AND m.ready_check_at < now() - interval '30 minutes')
            OR (m.ready_check_at IS NULL AND m.expires_at IS NOT NULL AND m.expires_at < now())
            OR (m.ready_check_at IS NULL AND m.expires_at IS NULL AND m.created_at < now() - interval '30 minutes')
          )
        )
      )
  LOOP
    IF v_match.team_size = 1 THEN
      FOR v_participant IN
        SELECT mp.user_id, mp.team_side
        FROM match_participants mp
        WHERE mp.match_id = v_match.id
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM transactions t
          WHERE t.match_id = v_match.id
            AND t.user_id = v_participant.user_id
            AND t.type = 'refund'
        ) THEN
          UPDATE wallets
          SET balance = balance + v_match.entry_fee,
              locked_balance = locked_balance - v_match.entry_fee
          WHERE user_id = v_participant.user_id
            AND locked_balance >= v_match.entry_fee;

          IF FOUND THEN
            INSERT INTO transactions (user_id, type, amount, match_id, description)
            VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 'Match expired - automatic refund');
            v_refunded_total := v_refunded_total + v_match.entry_fee;
          END IF;
        END IF;
      END LOOP;

    ELSE
      -- Team A
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
          IF NOT EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.match_id = v_match.id AND t.user_id = v_captain_id AND t.type = 'refund'
          ) THEN
            UPDATE wallets
            SET balance = balance + v_refund_amount,
                locked_balance = locked_balance - v_refund_amount
            WHERE user_id = v_captain_id
              AND locked_balance >= v_refund_amount;

            IF FOUND THEN
              INSERT INTO transactions (user_id, type, amount, match_id, description)
              VALUES (v_captain_id, 'refund', v_refund_amount, v_match.id, 'Match expired - captain refund (cover mode)');
              v_refunded_total := v_refunded_total + v_refund_amount;
            END IF;
          END IF;
        END IF;
      ELSE
        FOR v_participant IN
          SELECT mp.user_id
          FROM match_participants mp
          WHERE mp.match_id = v_match.id AND mp.team_side = 'A'
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.match_id = v_match.id AND t.user_id = v_participant.user_id AND t.type = 'refund'
          ) THEN
            UPDATE wallets
            SET balance = balance + v_match.entry_fee,
                locked_balance = locked_balance - v_match.entry_fee
            WHERE user_id = v_participant.user_id
              AND locked_balance >= v_match.entry_fee;

            IF FOUND THEN
              INSERT INTO transactions (user_id, type, amount, match_id, description)
              VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 'Match expired - automatic refund (split mode)');
              v_refunded_total := v_refunded_total + v_match.entry_fee;
            END IF;
          END IF;
        END LOOP;
      END IF;

      -- Team B (only if joined)
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
            IF NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.match_id = v_match.id AND t.user_id = v_captain_id AND t.type = 'refund'
            ) THEN
              UPDATE wallets
              SET balance = balance + v_refund_amount,
                  locked_balance = locked_balance - v_refund_amount
              WHERE user_id = v_captain_id
                AND locked_balance >= v_refund_amount;

              IF FOUND THEN
                INSERT INTO transactions (user_id, type, amount, match_id, description)
                VALUES (v_captain_id, 'refund', v_refund_amount, v_match.id, 'Match expired - captain refund (cover mode)');
                v_refunded_total := v_refunded_total + v_refund_amount;
              END IF;
            END IF;
          END IF;
        ELSE
          FOR v_participant IN
            SELECT mp.user_id
            FROM match_participants mp
            WHERE mp.match_id = v_match.id AND mp.team_side = 'B'
          LOOP
            IF NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.match_id = v_match.id AND t.user_id = v_participant.user_id AND t.type = 'refund'
            ) THEN
              UPDATE wallets
              SET balance = balance + v_match.entry_fee,
                  locked_balance = locked_balance - v_match.entry_fee
              WHERE user_id = v_participant.user_id
                AND locked_balance >= v_match.entry_fee;

              IF FOUND THEN
                INSERT INTO transactions (user_id, type, amount, match_id, description)
                VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 'Match expired - automatic refund (split mode)');
                v_refunded_total := v_refunded_total + v_match.entry_fee;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END IF;

    UPDATE matches
    SET status = 'expired'
    WHERE id = v_match.id
      AND status IN ('open', 'ready_check', 'joined', 'full');

    IF FOUND THEN
      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'refunded_total', v_refunded_total,
    'processed_at', now()
  );
END;
$$;

-- 3) Idempotent cron job (every minute)
DO $cronblock$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'expire-stale-matches-every-minute'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-stale-matches-every-minute',
    '* * * * *',
    $cmd$select public.expire_stale_matches();$cmd$
  );
END
$cronblock$;

-- 4) Immediate backfill pass
SELECT public.expire_stale_matches();
