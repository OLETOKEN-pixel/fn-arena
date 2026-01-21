-- ============================================================
-- FIX: Add persistent captain columns for stable result declaration
-- ============================================================

-- 1. Add captain columns to matches table
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS captain_a_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS captain_b_user_id UUID REFERENCES auth.users(id);

-- 2. Backfill Team A captain = always creator_id
UPDATE matches 
SET captain_a_user_id = creator_id
WHERE captain_a_user_id IS NULL;

-- 3. Backfill Team B captain for team matches = owner of the team that joined
UPDATE matches m
SET captain_b_user_id = t.owner_id
FROM teams t
WHERE m.team_b_id = t.id
  AND m.captain_b_user_id IS NULL
  AND m.team_size > 1;

-- 4. Backfill Team B captain for 1v1 = the user in team_side B
UPDATE matches m
SET captain_b_user_id = (
  SELECT user_id FROM match_participants 
  WHERE match_id = m.id AND team_side = 'B'
  LIMIT 1
)
WHERE m.captain_b_user_id IS NULL 
  AND m.team_size = 1
  AND EXISTS (
    SELECT 1 FROM match_participants 
    WHERE match_id = m.id AND team_side = 'B'
  );

-- 5. Update create_team_match to set captain_a_user_id
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
  v_caller_id UUID := auth.uid();
  v_match_id UUID;
  v_team RECORD;
  v_member RECORD;
  v_accepted_members UUID[];
  v_share NUMERIC;
  v_expires_at TIMESTAMPTZ;
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

  -- Check no member has active match
  FOR v_member IN 
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT p_team_size
  LOOP
    IF public.has_active_match(v_member.user_id) THEN
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
$$;

-- 6. Update create_match_1v1 to set captain_a_user_id
CREATE OR REPLACE FUNCTION public.create_match_1v1(
  p_entry_fee NUMERIC,
  p_region TEXT,
  p_platform TEXT,
  p_mode TEXT,
  p_first_to INTEGER DEFAULT 3,
  p_is_private BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_match_id UUID;
  v_balance NUMERIC;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Check caller doesn't have active match
  IF public.has_active_match(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an active match');
  END IF;

  -- Check balance
  SELECT balance INTO v_balance FROM wallets WHERE user_id = v_caller_id;
  IF v_balance IS NULL OR v_balance < p_entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_expires_at := now() + interval '30 minutes';

  -- Create match with captain_a_user_id set
  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, status, expires_at, payment_mode_host,
    captain_a_user_id
  ) VALUES (
    v_caller_id, 'Fortnite', p_region, p_platform, p_mode, 1, p_first_to,
    p_entry_fee, p_is_private, 'open', v_expires_at, 'cover',
    v_caller_id
  ) RETURNING id INTO v_match_id;

  -- Lock funds
  UPDATE wallets SET balance = balance - p_entry_fee, locked_balance = locked_balance + p_entry_fee
  WHERE user_id = v_caller_id;

  INSERT INTO transactions (user_id, type, amount, description, match_id, status)
  VALUES (v_caller_id, 'lock', p_entry_fee, 'Entry fee locked', v_match_id, 'completed');

  -- Add as participant
  INSERT INTO match_participants (match_id, user_id, team_side, status)
  VALUES (v_match_id, v_caller_id, 'A', 'joined');

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);
END;
$$;

-- 7. Update join_team_match to set captain_b_user_id
CREATE OR REPLACE FUNCTION public.join_team_match(
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
  v_caller_id UUID := auth.uid();
  v_match RECORD;
  v_team RECORD;
  v_member RECORD;
  v_accepted_members UUID[];
  v_share NUMERIC;
BEGIN
  -- Validate match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open');
  END IF;
  IF v_match.team_a_id = p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join with same team');
  END IF;

  -- Validate team ownership
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can join match');
  END IF;

  -- Get accepted members
  SELECT array_agg(user_id) INTO v_accepted_members
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_accepted_members IS NULL OR array_length(v_accepted_members, 1) < v_match.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 
      format('Team needs %s accepted members', v_match.team_size));
  END IF;

  -- Check no member has active match
  FOR v_member IN 
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LIMIT v_match.team_size
  LOOP
    IF public.has_active_match(v_member.user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 
        format('Member %s already has an active match', v_member.username));
    END IF;
  END LOOP;

  -- Calculate share
  v_share := CASE WHEN p_payment_mode = 'split' THEN v_match.entry_fee / v_match.team_size ELSE v_match.entry_fee END;

  -- Lock funds and add participants
  FOR v_member IN 
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    ORDER BY CASE WHEN tm.user_id = v_caller_id THEN 0 ELSE 1 END, tm.created_at
    LIMIT v_match.team_size
  LOOP
    IF p_payment_mode = 'cover' THEN
      IF v_member.user_id = v_caller_id THEN
        UPDATE wallets SET balance = balance - v_match.entry_fee, locked_balance = locked_balance + v_match.entry_fee
        WHERE user_id = v_caller_id AND balance >= v_match.entry_fee;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Insufficient balance';
        END IF;
        INSERT INTO transactions (user_id, type, amount, description, match_id, status)
        VALUES (v_caller_id, 'lock', v_match.entry_fee, 'Entry fee locked (cover all)', p_match_id, 'completed');
      END IF;
    ELSE
      UPDATE wallets SET balance = balance - v_share, locked_balance = locked_balance + v_share
      WHERE user_id = v_member.user_id AND balance >= v_share;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Member has insufficient balance';
      END IF;
      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_share, 'Entry fee locked (split)', p_match_id, 'completed');
    END IF;

    INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
    VALUES (p_match_id, v_member.user_id, p_team_id, 'B', 'joined');
  END LOOP;

  -- Update match with team_b_id, payment_mode_joiner, status, AND captain_b_user_id
  UPDATE matches SET 
    team_b_id = p_team_id,
    payment_mode_joiner = p_payment_mode,
    status = 'ready_check',
    captain_b_user_id = v_caller_id
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. Update join_match_v2 for 1v1 to set captain_b_user_id
CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_match RECORD;
  v_balance NUMERIC;
BEGIN
  -- Validate match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open');
  END IF;
  IF v_match.creator_id = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;
  IF v_match.team_size != 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Use join_team_match for team matches');
  END IF;

  -- Check active match
  IF public.has_active_match(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an active match');
  END IF;

  -- Check balance
  SELECT balance INTO v_balance FROM wallets WHERE user_id = v_caller_id;
  IF v_balance IS NULL OR v_balance < v_match.entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Lock funds
  UPDATE wallets SET balance = balance - v_match.entry_fee, locked_balance = locked_balance + v_match.entry_fee
  WHERE user_id = v_caller_id;

  INSERT INTO transactions (user_id, type, amount, description, match_id, status)
  VALUES (v_caller_id, 'lock', v_match.entry_fee, 'Entry fee locked', p_match_id, 'completed');

  -- Add as participant
  INSERT INTO match_participants (match_id, user_id, team_side, status)
  VALUES (p_match_id, v_caller_id, 'B', 'joined');

  -- Update match status AND set captain_b_user_id
  UPDATE matches SET 
    status = 'ready_check',
    captain_b_user_id = v_caller_id
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. Update declare_result to use captain columns instead of ORDER BY joined_at
CREATE OR REPLACE FUNCTION public.declare_result(
  p_match_id UUID,
  p_result TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_match RECORD;
  v_participant RECORD;
  v_user_team_side TEXT;
  v_is_captain BOOLEAN;
  v_other_team_result TEXT;
  v_winner_side TEXT;
  v_loser_side TEXT;
BEGIN
  -- Get match with captain columns
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in progress', 'status', v_match.status);
  END IF;

  -- Get caller's participant record
  SELECT * INTO v_participant FROM match_participants 
  WHERE match_id = p_match_id AND user_id = v_caller_id;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in this match');
  END IF;

  v_user_team_side := v_participant.team_side;

  -- Check if caller is captain using persistent columns
  IF v_match.team_size > 1 THEN
    -- Team match: use captain columns
    v_is_captain := (v_user_team_side = 'A' AND v_caller_id = v_match.captain_a_user_id)
                 OR (v_user_team_side = 'B' AND v_caller_id = v_match.captain_b_user_id);
    
    IF NOT v_is_captain THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Only the team captain can declare the result',
        'caller_user_id', v_caller_id,
        'expected_captain_user_id', CASE WHEN v_user_team_side = 'A' THEN v_match.captain_a_user_id ELSE v_match.captain_b_user_id END,
        'team_side', v_user_team_side
      );
    END IF;
  END IF;

  -- Check if already declared
  IF v_participant.result_choice IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already declared a result', 'status', 'already_submitted');
  END IF;

  -- Update participant result
  UPDATE match_participants 
  SET result_choice = p_result, result_at = now()
  WHERE id = v_participant.id;

  -- Update match status
  UPDATE matches SET status = 'result_pending' WHERE id = p_match_id AND status = 'in_progress';

  -- Check opponent result (for team matches, check other team's captain)
  IF v_match.team_size > 1 THEN
    -- Get opponent captain's result
    SELECT mp.result_choice INTO v_other_team_result
    FROM match_participants mp
    WHERE mp.match_id = p_match_id 
      AND mp.user_id = CASE WHEN v_user_team_side = 'A' THEN v_match.captain_b_user_id ELSE v_match.captain_a_user_id END;
  ELSE
    -- 1v1: get opponent's result
    SELECT result_choice INTO v_other_team_result
    FROM match_participants
    WHERE match_id = p_match_id AND team_side != v_user_team_side;
  END IF;

  -- If opponent hasn't declared yet
  IF v_other_team_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_opponent');
  END IF;

  -- Both have declared - check for agreement
  IF (p_result = 'WIN' AND v_other_team_result = 'LOSS') OR (p_result = 'LOSS' AND v_other_team_result = 'WIN') THEN
    -- Agreement reached
    v_winner_side := CASE WHEN p_result = 'WIN' THEN v_user_team_side ELSE (CASE WHEN v_user_team_side = 'A' THEN 'B' ELSE 'A' END) END;
    v_loser_side := CASE WHEN v_winner_side = 'A' THEN 'B' ELSE 'A' END;

    IF v_match.team_size > 1 THEN
      PERFORM public.finalize_team_match(p_match_id, v_winner_side);
    ELSE
      PERFORM public.finalize_match_payout(p_match_id, v_winner_side);
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'completed', 'winner_side', v_winner_side);
  ELSE
    -- Dispute
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', true, 'status', 'disputed');
  END IF;
END;
$$;