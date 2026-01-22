-- Patch: Fix false positives in team member active-match check (join_team_match + both create_team_match overloads)

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
  -- 1. Lock and fetch match
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

  -- 2. Verify caller owns the joining team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can join matches');
  END IF;

  -- 3. Cannot join own match
  IF v_match.team_a_id = p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;

  -- 4. Check team has enough accepted members
  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id AND status = 'accepted') < v_match.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team does not have enough accepted members');
  END IF;

  -- 5. Check no active match for any team member (STRICT)
  -- Active match statuses: open | ready_check | in_progress | result_pending
  -- Active participant statuses: joined | ready | playing
  FOR v_member IN
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT v_match.team_size
  LOOP
    -- 5a) Auto-clean ghost matches that are objectively terminal by timestamps (safe cleanup)
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

    -- 5b) Strict active-match check (only real active participations block)
    SELECT COUNT(*) INTO v_active_count
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_member.user_id
      AND mp.status IN ('joined','ready','playing')
      AND m.status IN ('open','ready_check','in_progress','result_pending')
      AND m.expires_at > now()
      AND m.finished_at IS NULL;

    IF v_active_count > 0 THEN
      -- Logging (temporary) to identify the exact blocking match
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

  -- 6. Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    -- Owner covers entire team: entry_fee * team_size
    v_total_lock := v_match.entry_fee * v_match.team_size;

    UPDATE wallets
    SET balance = balance - v_total_lock,
        locked_balance = locked_balance + v_total_lock,
        updated_at = now()
    WHERE user_id = v_caller_id AND balance >= v_total_lock;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
    END IF;

    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (v_caller_id, 'lock', v_total_lock, 'Match entry locked (covering team)', p_match_id);

  ELSIF p_payment_mode = 'split' THEN
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

      INSERT INTO transactions (user_id, type, amount, description, reference_id)
      VALUES (v_member.user_id, 'lock', v_member_share, 'Match entry locked (split)', p_match_id);
    END LOOP;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  -- 7. Update match with team B info
  UPDATE matches SET
    team_b_id = p_team_id,
    captain_b_user_id = v_caller_id,
    joiner_payment_mode = p_payment_mode,
    joiner_payer_user_id = v_caller_id,
    status = 'ready_check',
    ready_check_at = now()
  WHERE id = p_match_id;

  -- 8. Add team B members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, joined_at, payment_mode)
  SELECT p_match_id, tm.user_id, 'B', now(), p_payment_mode
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT v_match.team_size;

  RETURN jsonb_build_object('success', true, 'match_id', p_match_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id uuid,
  p_entry_fee numeric,
  p_region text,
  p_platform text,
  p_mode text,
  p_team_size integer,
  p_first_to integer DEFAULT 3,
  p_payment_mode text DEFAULT 'cover'::text,
  p_is_private boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_match_id UUID;
  v_team RECORD;
  v_member RECORD;
  v_accepted_members UUID[];
  v_share NUMERIC;
  v_expires_at TIMESTAMPTZ;
  v_ghost record;
  v_block record;
  v_active_count integer;
BEGIN
  -- Validate team ownership
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can create match');
  END IF;

  -- Get accepted members
  SELECT array_agg(user_id) INTO v_accepted_members
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_accepted_members IS NULL OR array_length(v_accepted_members, 1) < p_team_size THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Team needs %s accepted members, has %s', p_team_size, COALESCE(array_length(v_accepted_members, 1), 0)));
  END IF;

  -- Check no member has active match (STRICT)
  FOR v_member IN
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT p_team_size
  LOOP
    -- Auto-clean ghost matches (safe)
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

      RAISE LOG '[create_team_match ghost-clean] member=% match_id=%', v_member.user_id, v_ghost.match_id;
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

      RAISE LOG '[create_team_match busy-check] member=% match_id=% match_status=% participant_status=% expires_at=% finished_at=% created_at=%',
        v_member.user_id,
        v_block.match_id,
        v_block.match_status,
        v_block.participant_status,
        v_block.expires_at,
        v_block.finished_at,
        v_block.created_at;

      RETURN jsonb_build_object('success', false, 'error',
        format('Member %s already has an active match', v_member.username));
    END IF;
  END LOOP;

  -- Calculate share per member
  v_share := CASE WHEN p_payment_mode = 'split' THEN p_entry_fee / p_team_size ELSE p_entry_fee END;
  v_expires_at := now() + interval '30 minutes';

  -- Create match with captain_a_user_id set to caller (team owner)
  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, status, expires_at, team_a_id, payment_mode_host,
    captain_a_user_id
  ) VALUES (
    v_caller_id, 'Fortnite', p_region, p_platform, p_mode, p_team_size, p_first_to,
    p_entry_fee, p_is_private, 'open', v_expires_at, p_team_id, p_payment_mode,
    v_caller_id
  ) RETURNING id INTO v_match_id;

  -- Lock funds and add participants
  FOR v_member IN
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    ORDER BY CASE WHEN tm.user_id = v_caller_id THEN 0 ELSE 1 END, tm.created_at
    LIMIT p_team_size
  LOOP
    IF p_payment_mode = 'cover' THEN
      -- Owner pays all
      IF v_member.user_id = v_caller_id THEN
        UPDATE wallets SET balance = balance - p_entry_fee, locked_balance = locked_balance + p_entry_fee
        WHERE user_id = v_caller_id AND balance >= p_entry_fee;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Insufficient balance';
        END IF;
        INSERT INTO transactions (user_id, type, amount, description, match_id, status)
        VALUES (v_caller_id, 'lock', p_entry_fee, 'Entry fee locked (cover all)', v_match_id, 'completed');
      END IF;
    ELSE
      -- Split payment
      UPDATE wallets SET balance = balance - v_share, locked_balance = locked_balance + v_share
      WHERE user_id = v_member.user_id AND balance >= v_share;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Member has insufficient balance';
      END IF;
      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_share, 'Entry fee locked (split)', v_match_id, 'completed');
    END IF;

    INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
    VALUES (v_match_id, v_member.user_id, p_team_id, 'A', 'joined');
  END LOOP;

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id uuid,
  p_game text,
  p_region text,
  p_platform text,
  p_mode text,
  p_team_size integer,
  p_first_to integer,
  p_entry_fee numeric,
  p_is_private boolean DEFAULT false,
  p_payment_mode text DEFAULT 'cover'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_team teams%ROWTYPE;
  v_match_id uuid;
  v_expires_at timestamptz;
  v_active_count integer;
  v_total_lock numeric;
  v_member record;
  v_member_share numeric;
  v_ghost record;
  v_block record;
BEGIN
  -- 1. Verify caller owns the team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;

  -- 2. Check team has enough accepted members
  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id AND status = 'accepted') < p_team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team does not have enough accepted members');
  END IF;

  -- 3. Check no active match for any team member (STRICT)
  FOR v_member IN
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT p_team_size
  LOOP
    -- Auto-clean ghost matches (safe)
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

      RAISE LOG '[create_team_match(p_game) ghost-clean] member=% match_id=%', v_member.user_id, v_ghost.match_id;
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

      RAISE LOG '[create_team_match(p_game) busy-check] member=% match_id=% match_status=% participant_status=% expires_at=% finished_at=% created_at=%',
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

  -- 4. Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    -- Owner covers the entire team: entry_fee * team_size
    v_total_lock := p_entry_fee * p_team_size;

    -- Check and lock funds from owner
    UPDATE wallets
    SET balance = balance - v_total_lock,
        locked_balance = locked_balance + v_total_lock,
        updated_at = now()
    WHERE user_id = v_caller_id AND balance >= v_total_lock;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
    END IF;

    -- Record single transaction for owner
    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (v_caller_id, 'lock', v_total_lock, 'Match entry locked (covering team)', NULL);

  ELSIF p_payment_mode = 'split' THEN
    -- Each member pays their share
    v_member_share := p_entry_fee;

    FOR v_member IN
      SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT p_team_size
    LOOP
      UPDATE wallets
      SET balance = balance - v_member_share,
          locked_balance = locked_balance + v_member_share,
          updated_at = now()
      WHERE user_id = v_member.user_id AND balance >= v_member_share;

      IF NOT FOUND THEN
        -- Rollback: This will be handled by transaction rollback
        RAISE EXCEPTION 'Member % has insufficient balance', v_member.user_id;
      END IF;

      INSERT INTO transactions (user_id, type, amount, description)
      VALUES (v_member.user_id, 'lock', v_member_share, 'Match entry locked (split)');
    END LOOP;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  -- 5. Create match
  v_expires_at := now() + interval '30 minutes';

  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, status, expires_at,
    team_a_id, captain_a_user_id, host_payment_mode, host_payer_user_id
  ) VALUES (
    v_caller_id, p_game, p_region, p_platform, p_mode, p_team_size, p_first_to,
    p_entry_fee, p_is_private, 'open', v_expires_at,
    p_team_id, v_caller_id, p_payment_mode, v_caller_id
  )
  RETURNING id INTO v_match_id;

  -- 6. Add team members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, joined_at, payment_mode)
  SELECT v_match_id, tm.user_id, 'A', now(), p_payment_mode
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT p_team_size;

  -- 7. Update transaction references
  UPDATE transactions
  SET reference_id = v_match_id
  WHERE reference_id IS NULL
    AND type = 'lock'
    AND user_id IN (SELECT user_id FROM match_participants WHERE match_id = v_match_id);

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
