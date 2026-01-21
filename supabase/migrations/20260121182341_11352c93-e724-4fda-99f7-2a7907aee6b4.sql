-- Fix expire_stale_matches to use correct column names
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
    UPDATE matches SET status = 'expired', updated_at = now() WHERE id = v_match.id;
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