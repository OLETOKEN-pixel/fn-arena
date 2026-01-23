-- Fix definitivo payout/finalizzazione: lock checks per-side, payer deterministici, no self-heal, e allineamento create/join team payer+lock.

-- ------------------------------------------------------------
-- Indexes (safe, minimal) for faster finalize checks
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_match_participants_match_side ON public.match_participants(match_id, team_side);
CREATE INDEX IF NOT EXISTS idx_transactions_match_type_status ON public.transactions(match_id, type, status);

-- ------------------------------------------------------------
-- create_team_match (canonical signature used by frontend)
-- - lock/importi POSITIVI
-- - split: lock solo sui partecipanti reali (LIMIT team_size)
-- - cover: host_payer_user_id valorizzato solo se cover, altrimenti NULL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id UUID,
  p_entry_fee NUMERIC,
  p_region TEXT,
  p_platform TEXT,
  p_mode TEXT,
  p_team_size INTEGER,
  p_first_to INTEGER DEFAULT 3,
  p_payment_mode TEXT DEFAULT 'cover',
  p_is_private BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_team RECORD;
  v_member RECORD;
  v_match_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_total_entry NUMERIC;
  v_per_member_fee NUMERIC;
  v_private_code TEXT;
  v_accepted_count INTEGER;
  v_participants UUID[];
  v_lock_amount NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_team_size IS NULL OR p_team_size < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team_size');
  END IF;

  IF p_payment_mode NOT IN ('cover','split') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;

  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_accepted_count < p_team_size THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Team needs %s accepted members for %sv%s match (has %s)', p_team_size, p_team_size, p_team_size, v_accepted_count)
    );
  END IF;

  -- Strict busy check (keep existing helper)
  FOR v_member IN
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT p_team_size
  LOOP
    IF public.has_active_match(v_member.user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more team members already have an active match');
    END IF;
  END LOOP;

  v_total_entry := p_entry_fee * p_team_size;
  v_per_member_fee := p_entry_fee;

  IF p_is_private THEN
    v_private_code := upper(substr(md5(random()::text), 1, 6));
  END IF;

  -- 30 minutes (keep platform behavior)
  v_expires_at := now() + interval '30 minutes';

  -- Deterministic participant selection (real participants for this match)
  SELECT array_agg(u.user_id) INTO v_participants
  FROM (
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    ORDER BY (tm.role = 'owner') DESC, tm.created_at ASC
    LIMIT p_team_size
  ) u;

  IF v_participants IS NULL OR array_length(v_participants, 1) <> p_team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not select participants');
  END IF;

  -- Create match
  INSERT INTO matches (
    creator_id,
    game,
    region,
    platform,
    mode,
    team_size,
    first_to,
    entry_fee,
    is_private,
    private_code,
    expires_at,
    status,
    team_a_id,
    host_payer_user_id,
    payment_mode_host
  ) VALUES (
    v_user_id,
    'FN',
    p_region,
    p_platform,
    p_mode,
    p_team_size,
    p_first_to,
    p_entry_fee,
    p_is_private,
    v_private_code,
    v_expires_at,
    'open',
    p_team_id,
    CASE WHEN p_payment_mode = 'cover' THEN v_user_id ELSE NULL END,
    p_payment_mode
  )
  RETURNING id INTO v_match_id;

  -- Add participants (team A)
  FOREACH v_member.user_id IN ARRAY v_participants
  LOOP
    INSERT INTO match_participants (match_id, user_id, team_side, team_id, status)
    VALUES (v_match_id, v_member.user_id, 'A', p_team_id, 'joined');
  END LOOP;

  -- Lock funds based on payment mode (ONLY for selected participants)
  IF p_payment_mode = 'cover' THEN
    v_lock_amount := v_total_entry;

    UPDATE wallets
    SET balance = balance - v_lock_amount,
        locked_balance = locked_balance + v_lock_amount,
        updated_at = now()
    WHERE user_id = v_user_id AND balance >= v_lock_amount;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Insufficient balance. Need %s coins to cover team', v_lock_amount));
    END IF;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_user_id, 'lock', v_lock_amount, format('Match entry locked (covering team, size=%s)', p_team_size), v_match_id, 'completed');

  ELSE
    FOREACH v_member.user_id IN ARRAY v_participants
    LOOP
      UPDATE wallets
      SET balance = balance - v_per_member_fee,
          locked_balance = locked_balance + v_per_member_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id AND balance >= v_per_member_fee;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Member % has insufficient balance', v_member.user_id;
      END IF;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_per_member_fee, 'Match entry locked (split)', v_match_id, 'completed');
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'private_code', v_private_code
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------
-- join_team_match (payer deterministico)
-- - joiner_payer_user_id valorizzato solo se cover, altrimenti NULL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id uuid,
  p_team_id uuid,
  p_payment_mode text DEFAULT 'cover'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_match matches%ROWTYPE;
  v_team teams%ROWTYPE;
  v_total_lock numeric;
  v_member_share numeric;
  v_member record;
  v_active_count integer;
  v_ghost record;
  v_block record;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  IF v_match.team_b_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already has an opponent');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can join matches');
  END IF;

  IF v_match.team_a_id = p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;

  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id AND status = 'accepted') < v_match.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team does not have enough accepted members');
  END IF;

  FOR v_member IN
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT v_match.team_size
  LOOP
    FOR v_ghost IN
      SELECT m.id AS match_id
      FROM match_participants mp
      JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = v_member.user_id
        AND mp.status IN ('joined','ready','playing')
        AND m.status IN ('open','ready_check','in_progress','result_pending')
        AND (m.expires_at <= now() OR m.finished_at IS NOT NULL)
    LOOP
      UPDATE matches
      SET status = CASE WHEN finished_at IS NOT NULL THEN 'finished' ELSE 'expired' END
      WHERE id = v_ghost.match_id
        AND status IN ('open','ready_check','in_progress','result_pending')
        AND (expires_at <= now() OR finished_at IS NOT NULL);

      UPDATE match_participants
      SET status = 'left'
      WHERE match_id = v_ghost.match_id
        AND status IN ('joined','ready','playing');

      RAISE LOG '[join_team_match ghost-clean] member=% match_id=%', v_member.user_id, v_ghost.match_id;
    END LOOP;

    SELECT COUNT(*) INTO v_active_count
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_member.user_id
      AND mp.status IN ('joined','ready','playing')
      AND m.status IN ('open','ready_check','in_progress','result_pending')
      AND m.expires_at > now()
      AND m.finished_at IS NULL;

    IF v_active_count > 0 THEN
      SELECT m.id AS match_id,
             m.status AS match_status,
             mp.status AS participant_status,
             m.expires_at,
             m.finished_at,
             m.created_at
      INTO v_block
      FROM match_participants mp
      JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = v_member.user_id
        AND mp.status IN ('joined','ready','playing')
        AND m.status IN ('open','ready_check','in_progress','result_pending')
        AND m.expires_at > now()
        AND m.finished_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT 1;

      RAISE LOG '[join_team_match busy-check] member=% match_id=% match_status=% participant_status=% expires_at=% finished_at=% created_at=%',
        v_member.user_id,
        v_block.match_id,
        v_block.match_status,
        v_block.participant_status,
        v_block.expires_at,
        v_block.finished_at,
        v_block.created_at;

      RETURN jsonb_build_object('success', false, 'error', 'One or more team members already have an active match');
    END IF;
  END LOOP;

  IF p_payment_mode NOT IN ('cover','split') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  IF p_payment_mode = 'cover' THEN
    v_total_lock := v_match.entry_fee * v_match.team_size;

    UPDATE wallets
    SET balance = balance - v_total_lock,
        locked_balance = locked_balance + v_total_lock,
        updated_at = now()
    WHERE user_id = v_caller_id AND balance >= v_total_lock;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
    END IF;

    INSERT INTO transactions (user_id, type, amount, description, match_id)
    VALUES (v_caller_id, 'lock', v_total_lock, 'Match entry locked (covering team)', p_match_id);

  ELSE
    v_member_share := v_match.entry_fee;

    FOR v_member IN
      SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT v_match.team_size
    LOOP
      UPDATE wallets
      SET balance = balance - v_member_share,
          locked_balance = locked_balance + v_member_share,
          updated_at = now()
      WHERE user_id = v_member.user_id AND balance >= v_member_share;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Member % has insufficient balance', v_member.user_id;
      END IF;

      INSERT INTO transactions (user_id, type, amount, description, match_id)
      VALUES (v_member.user_id, 'lock', v_member_share, 'Match entry locked (split)', p_match_id);
    END LOOP;
  END IF;

  UPDATE matches SET
    team_b_id = p_team_id,
    captain_b_user_id = v_caller_id,
    payment_mode_joiner = p_payment_mode,
    joiner_payer_user_id = CASE WHEN p_payment_mode = 'cover' THEN v_caller_id ELSE NULL END,
    status = 'ready_check',
    ready_check_at = now()
  WHERE id = p_match_id;

  INSERT INTO match_participants (match_id, user_id, team_side, joined_at)
  SELECT p_match_id, tm.user_id, 'B', now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT v_match.team_size;

  RETURN jsonb_build_object('success', true, 'match_id', p_match_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ------------------------------------------------------------
-- try_finalize_match (robust)
-- - per-side participant count check
-- - per-side lock check based on payment_mode and payer columns
-- - no self-heal: if missing payer/lock mismatch -> disputed + admin_notes JSON
-- - idempotent: if payout exists -> already_finalized
-- - never loops: ends in completed / disputed / need_other_team
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_finalize_match(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_a_result text;
  v_b_result text;
  v_winner_side text;
  v_payout_exists boolean;
  v_total_locked numeric;
  v_expected_locked numeric;

  v_count_a int;
  v_count_b int;

  v_team_size int;
  v_entry_fee numeric;

  v_host_mode text;
  v_joiner_mode text;
  v_host_payer uuid;
  v_joiner_payer uuid;

  v_lock_rows jsonb;
  v_diag jsonb;

  v_finalize jsonb;
  v_note text;
BEGIN
  SELECT * INTO v_match
  FROM matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'Match not found');
  END IF;

  -- Idempotency: payout already exists
  SELECT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.match_id = p_match_id
      AND t.type = 'payout'
      AND t.status = 'completed'
  ) INTO v_payout_exists;

  IF v_payout_exists THEN
    IF v_match.status NOT IN ('completed','admin_resolved','finished') THEN
      UPDATE matches
      SET status = 'completed',
          finished_at = COALESCE(finished_at, now())
      WHERE id = p_match_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'status', 'already_finalized');
  END IF;

  IF v_match.status IN ('completed','admin_resolved','finished','expired','cancelled','canceled') THEN
    RETURN jsonb_build_object('success', true, 'status', 'terminal');
  END IF;

  IF v_match.status NOT IN ('in_progress','result_pending','disputed') THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_state', 'error', 'Match not in finalizable state');
  END IF;

  -- Read declarations
  SELECT mp.result_choice INTO v_a_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id AND mp.team_side = 'A' AND mp.result_choice IS NOT NULL
  LIMIT 1;

  SELECT mp.result_choice INTO v_b_result
  FROM match_participants mp
  WHERE mp.match_id = p_match_id AND mp.team_side = 'B' AND mp.result_choice IS NOT NULL
  LIMIT 1;

  IF v_a_result IS NULL OR v_b_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'need_other_team');
  END IF;

  IF v_a_result = 'WIN' AND v_b_result = 'LOSS' THEN
    v_winner_side := 'A';
  ELSIF v_a_result = 'LOSS' AND v_b_result = 'WIN' THEN
    v_winner_side := 'B';
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

    v_diag := jsonb_build_object(
      'reason', 'conflicting_declarations',
      'teamA', v_a_result,
      'teamB', v_b_result
    );

    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Conflicting team declarations', v_diag::text)
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'conflict');
  END IF;

  v_team_size := COALESCE(v_match.team_size, 1);
  v_entry_fee := v_match.entry_fee;

  -- Team matches: validate participant counts and lock distribution per-side
  IF v_team_size > 1 THEN
    SELECT COUNT(*) INTO v_count_a
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = 'A';

    SELECT COUNT(*) INTO v_count_b
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = 'B';

    IF v_count_a <> v_team_size OR v_count_b <> v_team_size THEN
      UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

      v_diag := jsonb_build_object(
        'reason', 'participant_count_mismatch',
        'expected_per_side', v_team_size,
        'countA', v_count_a,
        'countB', v_count_b
      );

      INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
      VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
      ON CONFLICT (match_id) DO UPDATE SET
        status = 'disputed',
        dispute_reason = EXCLUDED.dispute_reason,
        admin_notes = EXCLUDED.admin_notes,
        updated_at = now();

      RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'participant_count_mismatch');
    END IF;

    v_host_mode := COALESCE(v_match.payment_mode_host, 'cover');
    v_joiner_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
    v_host_payer := v_match.host_payer_user_id;
    v_joiner_payer := v_match.joiner_payer_user_id;

    -- Collect locks for diagnostics
    SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_lock_rows
    FROM (
      SELECT t.user_id, SUM(t.amount) AS locked_amount
      FROM transactions t
      WHERE t.match_id = p_match_id AND t.type = 'lock' AND t.status = 'completed'
      GROUP BY t.user_id
      ORDER BY SUM(t.amount) DESC
    ) x;

    -- Validate payer presence for cover
    IF v_host_mode = 'cover' AND v_host_payer IS NULL THEN
      UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
      v_diag := jsonb_build_object(
        'reason', 'missing_host_payer_for_cover',
        'payment_mode_host', v_host_mode,
        'locks', v_lock_rows
      );
      INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
      VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
      ON CONFLICT (match_id) DO UPDATE SET
        status = 'disputed',
        dispute_reason = EXCLUDED.dispute_reason,
        admin_notes = EXCLUDED.admin_notes,
        updated_at = now();
      RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'missing_payer');
    END IF;

    IF v_joiner_mode = 'cover' AND v_joiner_payer IS NULL THEN
      UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
      v_diag := jsonb_build_object(
        'reason', 'missing_joiner_payer_for_cover',
        'payment_mode_joiner', v_joiner_mode,
        'locks', v_lock_rows
      );
      INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
      VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
      ON CONFLICT (match_id) DO UPDATE SET
        status = 'disputed',
        dispute_reason = EXCLUDED.dispute_reason,
        admin_notes = EXCLUDED.admin_notes,
        updated_at = now();
      RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'missing_payer');
    END IF;

    -- Per-side lock expectations
    -- Cover: only payer has entry_fee*team_size lock
    -- Split: each participant has entry_fee lock

    -- Host side (A)
    IF v_host_mode = 'cover' THEN
      IF COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed' AND t.user_id=v_host_payer), 0) <> (v_entry_fee * v_team_size) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_host_cover',
          'expected', v_entry_fee * v_team_size,
          'payer', v_host_payer,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

      IF COALESCE((SELECT SUM(t.amount)
                  FROM transactions t
                  WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed'
                    AND t.user_id IN (SELECT mp.user_id FROM match_participants mp WHERE mp.match_id=p_match_id AND mp.team_side='A' AND mp.user_id <> v_host_payer)
                 ), 0) <> 0 THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_host_cover_nonpayer',
          'expected', 0,
          'payer', v_host_payer,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

    ELSE
      IF COALESCE((SELECT SUM(t.amount)
                  FROM transactions t
                  WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed'
                    AND t.user_id IN (SELECT mp.user_id FROM match_participants mp WHERE mp.match_id=p_match_id AND mp.team_side='A')
                 ), 0) <> (v_entry_fee * v_team_size) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_host_split_sum',
          'expected', v_entry_fee * v_team_size,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

      -- each participant exactly entry_fee
      IF EXISTS (
        SELECT 1
        FROM match_participants mp
        WHERE mp.match_id=p_match_id AND mp.team_side='A'
          AND COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed' AND t.user_id=mp.user_id), 0) <> v_entry_fee
      ) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_host_split_per_user',
          'expected_each', v_entry_fee,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;
    END IF;

    -- Joiner side (B)
    IF v_joiner_mode = 'cover' THEN
      IF COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed' AND t.user_id=v_joiner_payer), 0) <> (v_entry_fee * v_team_size) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_joiner_cover',
          'expected', v_entry_fee * v_team_size,
          'payer', v_joiner_payer,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

      IF COALESCE((SELECT SUM(t.amount)
                  FROM transactions t
                  WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed'
                    AND t.user_id IN (SELECT mp.user_id FROM match_participants mp WHERE mp.match_id=p_match_id AND mp.team_side='B' AND mp.user_id <> v_joiner_payer)
                 ), 0) <> 0 THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_joiner_cover_nonpayer',
          'expected', 0,
          'payer', v_joiner_payer,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

    ELSE
      IF COALESCE((SELECT SUM(t.amount)
                  FROM transactions t
                  WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed'
                    AND t.user_id IN (SELECT mp.user_id FROM match_participants mp WHERE mp.match_id=p_match_id AND mp.team_side='B')
                 ), 0) <> (v_entry_fee * v_team_size) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_joiner_split_sum',
          'expected', v_entry_fee * v_team_size,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM match_participants mp
        WHERE mp.match_id=p_match_id AND mp.team_side='B'
          AND COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.match_id=p_match_id AND t.type='lock' AND t.status='completed' AND t.user_id=mp.user_id), 0) <> v_entry_fee
      ) THEN
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        v_diag := jsonb_build_object(
          'reason', 'lock_mismatch_joiner_split_per_user',
          'expected_each', v_entry_fee,
          'locks', v_lock_rows
        );
        INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
        VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
        ON CONFLICT (match_id) DO UPDATE SET
          status='disputed',
          dispute_reason=EXCLUDED.dispute_reason,
          admin_notes=EXCLUDED.admin_notes,
          updated_at=now();
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
      END IF;
    END IF;
  END IF;

  -- Total lock sanity check (works for 1v1 and team)
  SELECT COALESCE(SUM(t.amount), 0) INTO v_total_locked
  FROM transactions t
  WHERE t.match_id = p_match_id AND t.type = 'lock' AND t.status = 'completed';

  v_expected_locked := (v_entry_fee * (v_team_size * 2));

  IF v_total_locked <> v_expected_locked THEN
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

    v_diag := jsonb_build_object(
      'reason', 'lock_mismatch_total',
      'total_locked', v_total_locked,
      'expected_total', v_expected_locked,
      'team_size', v_team_size,
      'entry_fee', v_entry_fee
    );

    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Settlement precondition failed', v_diag::text)
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'lock_mismatch');
  END IF;

  -- Attempt payout
  SELECT public.finalize_match_payout(p_match_id, v_winner_side) INTO v_finalize;

  IF v_finalize IS NULL THEN
    RAISE EXCEPTION 'finalize_match_payout returned null';
  END IF;

  IF COALESCE((v_finalize->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'finalize_match_payout failed: %', COALESCE(v_finalize->>'error', v_finalize::text);
  END IF;

  UPDATE matches
  SET status = 'completed',
      finished_at = COALESCE(finished_at, now())
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'completed', 'winner_side', v_winner_side);

EXCEPTION
  WHEN OTHERS THEN
    v_note := format('try_finalize_match: settlement_error=%s', SQLERRM);
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;

    INSERT INTO match_results (match_id, status, dispute_reason, admin_notes)
    VALUES (p_match_id, 'disputed', 'Settlement error', v_note)
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      admin_notes = EXCLUDED.admin_notes,
      updated_at = now();

    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'error_code', 'settlement_error', 'message', SQLERRM);
END;
$$;