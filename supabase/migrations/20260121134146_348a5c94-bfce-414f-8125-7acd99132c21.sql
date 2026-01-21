-- =============================================
-- DROPS FIRST - Clear all functions that need new return types
-- =============================================
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, text, boolean);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer);
DROP FUNCTION IF EXISTS public.team_has_active_match(uuid);
DROP FUNCTION IF EXISTS public.delete_team(uuid);
DROP FUNCTION IF EXISTS public.set_player_ready(uuid);
DROP FUNCTION IF EXISTS public.join_match_v2(uuid);
DROP FUNCTION IF EXISTS public.join_team_match(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.join_team_match(uuid, uuid);

-- =============================================
-- FIX 1: Recreate create_team_match with single signature
-- =============================================

CREATE FUNCTION public.create_team_match(
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
  v_user_id UUID;
  v_match_id UUID;
  v_team_member RECORD;
  v_total_cost NUMERIC;
  v_per_member_cost NUMERIC;
  v_expires_at TIMESTAMPTZ;
  v_private_code TEXT;
  v_accepted_count INTEGER;
  v_payer_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = p_team_id AND owner_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be the team owner to create a match');
  END IF;

  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_accepted_count < p_team_size THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Team needs %s accepted members, but only has %s', p_team_size, v_accepted_count)
    );
  END IF;

  FOR v_team_member IN
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT p_team_size
  LOOP
    IF public.has_active_match(v_team_member.user_id) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Team member %s is already in an active match', v_team_member.username)
      );
    END IF;
  END LOOP;

  v_total_cost := p_entry_fee * p_team_size;
  v_per_member_cost := p_entry_fee;

  IF p_payment_mode = 'cover' THEN
    IF NOT EXISTS (
      SELECT 1 FROM wallets WHERE user_id = v_user_id AND balance >= v_total_cost
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Insufficient balance. You need %s coins to cover the team', v_total_cost)
      );
    END IF;
    v_payer_user_id := v_user_id;
  ELSE
    FOR v_team_member IN
      SELECT tm.user_id, p.username, w.balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      LIMIT p_team_size
    LOOP
      IF v_team_member.balance < v_per_member_cost THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Team member %s has insufficient balance (%s/%s coins)', 
            v_team_member.username, v_team_member.balance, v_per_member_cost)
        );
      END IF;
    END LOOP;
    v_payer_user_id := NULL;
  END IF;

  IF p_is_private THEN
    v_private_code := upper(substring(md5(random()::text) from 1 for 6));
  END IF;

  v_expires_at := now() + interval '30 minutes';

  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, private_code, expires_at, status,
    team_a_id, payment_mode_host, host_payer_user_id
  ) VALUES (
    v_user_id, 'FN', p_region, p_platform, p_mode, p_team_size, p_first_to,
    p_entry_fee, p_is_private, v_private_code, v_expires_at, 'open',
    p_team_id, p_payment_mode, v_payer_user_id
  )
  RETURNING id INTO v_match_id;

  IF p_payment_mode = 'cover' THEN
    UPDATE wallets 
    SET balance = balance - v_total_cost,
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = v_user_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_user_id, 'lock', -v_total_cost, 'Team match entry (cover all)', v_match_id, 'completed');
  ELSE
    FOR v_team_member IN
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      LIMIT p_team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - v_per_member_cost,
          locked_balance = locked_balance + v_per_member_cost,
          updated_at = now()
      WHERE user_id = v_team_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_team_member.user_id, 'lock', -v_per_member_cost, 'Team match entry (split)', v_match_id, 'completed');
    END LOOP;
  END IF;

  INSERT INTO match_participants (match_id, user_id, team_id, team_side, status, joined_at)
  SELECT v_match_id, tm.user_id, p_team_id, 'A', 'joined', now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT p_team_size;

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id, 'private_code', v_private_code);
END;
$$;


-- =============================================
-- FIX 2: Team deletion with active match check
-- =============================================

CREATE FUNCTION public.team_has_active_match(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches m
    WHERE (m.team_a_id = p_team_id OR m.team_b_id = p_team_id)
    AND m.status NOT IN ('finished', 'expired', 'cancelled')
  );
END;
$$;

CREATE FUNCTION public.delete_team(p_team_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_team_name TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT name INTO v_team_name
  FROM teams 
  WHERE id = p_team_id AND owner_id = v_user_id;

  IF v_team_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found or you are not the owner');
  END IF;

  IF public.team_has_active_match(p_team_id) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Cannot delete team: team has an active match. Wait for the match to finish first.'
    );
  END IF;

  DELETE FROM team_members WHERE team_id = p_team_id;
  DELETE FROM teams WHERE id = p_team_id;

  RETURN jsonb_build_object('success', true, 'message', format('Team "%s" deleted successfully', v_team_name));
END;
$$;


-- =============================================
-- FIX 3: Add ready_check_at column and fix timing
-- =============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'matches' 
    AND column_name = 'ready_check_at'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN ready_check_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE FUNCTION public.set_player_ready(p_match_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_match RECORD;
  v_participant RECORD;
  v_all_ready BOOLEAN;
  v_ready_count INTEGER;
  v_total_count INTEGER;
  v_time_since_ready_check INTERVAL;
  v_is_fast_ready BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status NOT IN ('ready_check', 'full') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in ready check phase');
  END IF;

  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_user_id;

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant in this match');
  END IF;

  IF v_participant.ready THEN
    SELECT 
      COUNT(*) FILTER (WHERE ready = true),
      COUNT(*)
    INTO v_ready_count, v_total_count
    FROM match_participants
    WHERE match_id = p_match_id;

    RETURN jsonb_build_object(
      'success', true, 
      'already_ready', true,
      'status', v_match.status,
      'all_ready', (v_ready_count = v_total_count)
    );
  END IF;

  -- Use ready_check_at for timing (when match became full)
  IF v_match.ready_check_at IS NOT NULL THEN
    v_time_since_ready_check := now() - v_match.ready_check_at;
    v_is_fast_ready := v_time_since_ready_check <= interval '2 minutes';
  ELSE
    -- Fallback for old matches
    v_time_since_ready_check := now() - v_participant.joined_at;
    v_is_fast_ready := v_time_since_ready_check <= interval '2 minutes';
  END IF;

  UPDATE match_participants
  SET ready = true, ready_at = now()
  WHERE match_id = p_match_id AND user_id = v_user_id;

  IF v_is_fast_ready THEN
    PERFORM public.record_challenge_event(v_user_id, 'ready_up_fast', p_match_id);
  END IF;

  SELECT 
    COUNT(*) FILTER (WHERE ready = true),
    COUNT(*)
  INTO v_ready_count, v_total_count
  FROM match_participants
  WHERE match_id = p_match_id;

  v_all_ready := (v_ready_count = v_total_count);

  IF v_all_ready THEN
    UPDATE matches
    SET status = 'in_progress', started_at = now()
    WHERE id = p_match_id;

    FOR v_participant IN
      SELECT user_id FROM match_participants WHERE match_id = p_match_id
    LOOP
      PERFORM public.record_challenge_event(v_participant.user_id, 'match_created_started', p_match_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'status', CASE WHEN v_all_ready THEN 'in_progress' ELSE v_match.status END,
    'all_ready', v_all_ready,
    'ready_count', v_ready_count,
    'total_count', v_total_count,
    'fast_ready_recorded', v_is_fast_ready
  );
END;
$$;


-- =============================================
-- Update join functions to set ready_check_at
-- =============================================

CREATE FUNCTION public.join_match_v2(p_match_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_match RECORD;
  v_entry_fee NUMERIC;
  v_wallet_balance NUMERIC;
  v_new_status TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;

  IF v_match.expires_at < now() THEN
    UPDATE matches SET status = 'expired' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', false, 'error', 'Match has expired');
  END IF;

  IF v_match.creator_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;

  IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = p_match_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already in this match');
  END IF;

  IF public.has_active_match(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already in an active match');
  END IF;

  IF v_match.team_size != 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Use join_team_match for team matches');
  END IF;

  v_entry_fee := v_match.entry_fee;

  SELECT balance INTO v_wallet_balance FROM wallets WHERE user_id = v_user_id;

  IF v_wallet_balance IS NULL OR v_wallet_balance < v_entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE wallets
  SET balance = balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO transactions (user_id, type, amount, description, match_id, status)
  VALUES (v_user_id, 'lock', -v_entry_fee, 'Match entry fee', p_match_id, 'completed');

  INSERT INTO match_participants (match_id, user_id, team_side, status, joined_at)
  VALUES (p_match_id, v_user_id, 'B', 'joined', now());

  v_new_status := 'ready_check';
  
  UPDATE matches 
  SET status = v_new_status,
      joiner_payer_user_id = v_user_id,
      ready_check_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', v_new_status, 'message', 'Joined match successfully');
END;
$$;


CREATE FUNCTION public.join_team_match(
  p_match_id UUID,
  p_team_id UUID,
  p_payment_mode TEXT DEFAULT 'cover'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_match RECORD;
  v_team_member RECORD;
  v_entry_fee NUMERIC;
  v_total_cost NUMERIC;
  v_per_member_cost NUMERIC;
  v_accepted_count INTEGER;
  v_payer_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;

  IF v_match.expires_at < now() THEN
    UPDATE matches SET status = 'expired' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', false, 'error', 'Match has expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND owner_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be the team owner to join with this team');
  END IF;

  IF v_match.team_a_id = p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join with the same team as the host');
  END IF;

  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_accepted_count < v_match.team_size THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Team needs %s accepted members, but only has %s', v_match.team_size, v_accepted_count)
    );
  END IF;

  FOR v_team_member IN
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT v_match.team_size
  LOOP
    IF public.has_active_match(v_team_member.user_id) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Team member %s is already in an active match', v_team_member.username)
      );
    END IF;
  END LOOP;

  v_entry_fee := v_match.entry_fee;
  v_total_cost := v_entry_fee * v_match.team_size;
  v_per_member_cost := v_entry_fee;

  IF p_payment_mode = 'cover' THEN
    IF NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = v_user_id AND balance >= v_total_cost) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Insufficient balance. You need %s coins to cover the team', v_total_cost)
      );
    END IF;
    v_payer_user_id := v_user_id;
  ELSE
    FOR v_team_member IN
      SELECT tm.user_id, p.username, w.balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      LIMIT v_match.team_size
    LOOP
      IF v_team_member.balance < v_per_member_cost THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Team member %s has insufficient balance', v_team_member.username)
        );
      END IF;
    END LOOP;
    v_payer_user_id := NULL;
  END IF;

  IF p_payment_mode = 'cover' THEN
    UPDATE wallets 
    SET balance = balance - v_total_cost,
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = v_user_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_user_id, 'lock', -v_total_cost, 'Team match entry (cover all)', p_match_id, 'completed');
  ELSE
    FOR v_team_member IN
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      LIMIT v_match.team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - v_per_member_cost,
          locked_balance = locked_balance + v_per_member_cost,
          updated_at = now()
      WHERE user_id = v_team_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_team_member.user_id, 'lock', -v_per_member_cost, 'Team match entry (split)', p_match_id, 'completed');
    END LOOP;
  END IF;

  INSERT INTO match_participants (match_id, user_id, team_id, team_side, status, joined_at)
  SELECT p_match_id, tm.user_id, p_team_id, 'B', 'joined', now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT v_match.team_size;

  UPDATE matches 
  SET status = 'ready_check',
      team_b_id = p_team_id,
      payment_mode_joiner = p_payment_mode,
      joiner_payer_user_id = v_payer_user_id,
      ready_check_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'ready_check', 'message', 'Team joined match successfully');
END;
$$;