-- =====================================================
-- FIX: Deterministic payer tracking for team matches
-- Adds host_payer_user_id and joiner_payer_user_id columns
-- Updates all related RPCs to use explicit payer IDs
-- =====================================================

-- 1. Add payer tracking columns to matches table
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS host_payer_user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS joiner_payer_user_id uuid REFERENCES auth.users(id);

-- 2. Backfill existing team matches: host_payer is creator
UPDATE public.matches 
SET host_payer_user_id = creator_id 
WHERE team_size > 1 AND host_payer_user_id IS NULL;

-- 3. Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer, integer, boolean, text);
DROP FUNCTION IF EXISTS public.join_team_match(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.finalize_team_match(uuid, text);

-- =====================================================
-- 4. RECREATE create_team_match to set host_payer_user_id
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id uuid,
  p_entry_fee integer,
  p_region text,
  p_platform text,
  p_mode text,
  p_team_size integer,
  p_first_to integer DEFAULT 3,
  p_is_private boolean DEFAULT false,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_team_member_count integer;
  v_team record;
  v_member record;
  v_creator_balance numeric;
  v_member_balance numeric;
  v_total_cost numeric;
  v_expires_at timestamptz;
  v_platform_fee_rate numeric := 0.10;
BEGIN
  -- Calculate total cost
  v_total_cost := p_entry_fee * p_team_size;
  v_expires_at := now() + interval '30 minutes';

  -- Verify team exists and user is owner
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_team.owner_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;

  -- Count accepted members
  SELECT count(*) INTO v_team_member_count
  FROM team_members 
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_team_member_count < p_team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Not enough accepted members. Need ' || p_team_size || ', have ' || v_team_member_count);
  END IF;

  IF p_payment_mode = 'cover' THEN
    -- COVER mode: creator pays for everyone
    SELECT balance INTO v_creator_balance 
    FROM wallets WHERE user_id = auth.uid();
    
    IF COALESCE(v_creator_balance, 0) < v_total_cost THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance. You need ' || v_total_cost || ' Coins to cover the team');
    END IF;

    -- Create match with host_payer_user_id set to creator
    INSERT INTO matches (
      creator_id, entry_fee, region, platform, mode, team_size, first_to, 
      is_private, status, expires_at, team_a_id, payment_mode_host, host_payer_user_id
    ) VALUES (
      auth.uid(), p_entry_fee, p_region, p_platform, p_mode, p_team_size, p_first_to,
      p_is_private, 'open', v_expires_at, p_team_id, 'cover', auth.uid()
    ) RETURNING id INTO v_match_id;

    -- Lock funds from creator
    UPDATE wallets 
    SET balance = balance - v_total_cost, 
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    -- Create transaction record
    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (auth.uid(), 'lock', v_total_cost, 'Entry fee locked (covering team)', v_match_id, 'completed');

  ELSE
    -- SPLIT mode: each member pays their share
    -- First verify all members have sufficient balance
    FOR v_member IN 
      SELECT tm.user_id 
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT p_team_size
    LOOP
      SELECT balance INTO v_member_balance FROM wallets WHERE user_id = v_member.user_id;
      IF COALESCE(v_member_balance, 0) < p_entry_fee THEN
        RETURN json_build_object('success', false, 'error', 
          'Team member has insufficient balance for split payment');
      END IF;
    END LOOP;

    -- Create match (still set host_payer_user_id for captain identification)
    INSERT INTO matches (
      creator_id, entry_fee, region, platform, mode, team_size, first_to, 
      is_private, status, expires_at, team_a_id, payment_mode_host, host_payer_user_id
    ) VALUES (
      auth.uid(), p_entry_fee, p_region, p_platform, p_mode, p_team_size, p_first_to,
      p_is_private, 'open', v_expires_at, p_team_id, 'split', auth.uid()
    ) RETURNING id INTO v_match_id;

    -- Lock funds from each member
    FOR v_member IN 
      SELECT tm.user_id 
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT p_team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - p_entry_fee, 
          locked_balance = locked_balance + p_entry_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', p_entry_fee, 'Entry fee locked (split)', v_match_id, 'completed');
    END LOOP;
  END IF;

  -- Add team members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, team_id, joined_at)
  SELECT v_match_id, tm.user_id, 'A', p_team_id, now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  ORDER BY tm.joined_at ASC
  LIMIT p_team_size;

  RETURN json_build_object(
    'success', true, 
    'match_id', v_match_id,
    'message', 'Team match created successfully'
  );
END;
$$;

-- =====================================================
-- 5. RECREATE join_team_match to set joiner_payer_user_id
-- =====================================================
CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id uuid,
  p_team_id uuid,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_team record;
  v_team_member_count integer;
  v_member record;
  v_joiner_balance numeric;
  v_member_balance numeric;
  v_total_cost numeric;
BEGIN
  -- Get match details
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  
  IF v_match.team_size <= 1 THEN
    RETURN json_build_object('success', false, 'error', 'This is not a team match');
  END IF;

  -- Verify team exists and user is owner
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_team.owner_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only team owner can join matches');
  END IF;

  -- Prevent same team
  IF v_match.team_a_id = p_team_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot join with the same team');
  END IF;

  -- Count accepted members
  SELECT count(*) INTO v_team_member_count
  FROM team_members 
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_team_member_count < v_match.team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Not enough accepted members. Need ' || v_match.team_size || ', have ' || v_team_member_count);
  END IF;

  v_total_cost := v_match.entry_fee * v_match.team_size;

  IF p_payment_mode = 'cover' THEN
    -- COVER mode: joiner (captain) pays for everyone
    SELECT balance INTO v_joiner_balance 
    FROM wallets WHERE user_id = auth.uid();
    
    IF COALESCE(v_joiner_balance, 0) < v_total_cost THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance. You need ' || v_total_cost || ' Coins to cover the team');
    END IF;

    -- Lock funds from joiner
    UPDATE wallets 
    SET balance = balance - v_total_cost, 
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (auth.uid(), 'lock', v_total_cost, 'Entry fee locked (covering team)', p_match_id, 'completed');

  ELSE
    -- SPLIT mode: each member pays their share
    FOR v_member IN 
      SELECT tm.user_id 
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT v_match.team_size
    LOOP
      SELECT balance INTO v_member_balance FROM wallets WHERE user_id = v_member.user_id;
      IF COALESCE(v_member_balance, 0) < v_match.entry_fee THEN
        RETURN json_build_object('success', false, 'error', 
          'Team member has insufficient balance for split payment');
      END IF;
    END LOOP;

    -- Lock funds from each member
    FOR v_member IN 
      SELECT tm.user_id 
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT v_match.team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - v_match.entry_fee, 
          locked_balance = locked_balance + v_match.entry_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_match.entry_fee, 'Entry fee locked (split)', p_match_id, 'completed');
    END LOOP;
  END IF;

  -- Update match with team B info and joiner_payer_user_id
  UPDATE matches 
  SET team_b_id = p_team_id,
      payment_mode_joiner = p_payment_mode,
      joiner_payer_user_id = auth.uid(),
      status = 'ready',
      updated_at = now()
  WHERE id = p_match_id;

  -- Add team members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, team_id, joined_at)
  SELECT p_match_id, tm.user_id, 'B', p_team_id, now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  ORDER BY tm.joined_at ASC
  LIMIT v_match.team_size;

  RETURN json_build_object(
    'success', true, 
    'message', 'Team joined successfully. Match is ready to start!'
  );
END;
$$;

-- =====================================================
-- 6. RECREATE finalize_team_match with DETERMINISTIC payer logic
-- =====================================================
CREATE OR REPLACE FUNCTION public.finalize_team_match(
  p_match_id uuid,
  p_winner_side text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_entry_fee numeric;
  v_team_size integer;
  v_total_pool numeric;
  v_platform_fee numeric;
  v_payout_per_winner numeric;
  v_loser_side text;
  v_winner_payment_mode text;
  v_loser_payment_mode text;
  v_winner_payer_id uuid;
  v_loser_payer_id uuid;
  v_winner_payer_locked numeric;
  v_loser_payer_locked numeric;
  v_participant record;
  v_platform_fee_rate numeric := 0.10;
  v_existing_payout boolean;
BEGIN
  -- Get match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('result_pending', 'in_progress') THEN
    RETURN json_build_object('success', false, 'error', 'Match is not in a finalizable state');
  END IF;

  v_entry_fee := v_match.entry_fee;
  v_team_size := v_match.team_size;
  v_loser_side := CASE WHEN p_winner_side = 'A' THEN 'B' ELSE 'A' END;
  
  -- Determine payment modes
  v_winner_payment_mode := CASE WHEN p_winner_side = 'A' 
    THEN COALESCE(v_match.payment_mode_host, 'split')
    ELSE COALESCE(v_match.payment_mode_joiner, 'split')
  END;
  
  v_loser_payment_mode := CASE WHEN v_loser_side = 'A'
    THEN COALESCE(v_match.payment_mode_host, 'split')
    ELSE COALESCE(v_match.payment_mode_joiner, 'split')
  END;
  
  -- DETERMINISTIC PAYER IDENTIFICATION using new columns
  -- Winner payer
  IF p_winner_side = 'A' THEN
    v_winner_payer_id := COALESCE(v_match.host_payer_user_id, v_match.creator_id);
  ELSE
    v_winner_payer_id := v_match.joiner_payer_user_id;
    -- Fallback for old matches without joiner_payer_user_id
    IF v_winner_payer_id IS NULL THEN
      SELECT user_id INTO v_winner_payer_id
      FROM match_participants 
      WHERE match_id = p_match_id AND team_side = 'B'
      ORDER BY joined_at ASC LIMIT 1;
    END IF;
  END IF;
  
  -- Loser payer
  IF v_loser_side = 'A' THEN
    v_loser_payer_id := COALESCE(v_match.host_payer_user_id, v_match.creator_id);
  ELSE
    v_loser_payer_id := v_match.joiner_payer_user_id;
    IF v_loser_payer_id IS NULL THEN
      SELECT user_id INTO v_loser_payer_id
      FROM match_participants 
      WHERE match_id = p_match_id AND team_side = 'B'
      ORDER BY joined_at ASC LIMIT 1;
    END IF;
  END IF;

  -- Calculate pool and payout
  v_total_pool := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pool * v_platform_fee_rate;
  v_payout_per_winner := (v_total_pool - v_platform_fee) / v_team_size;

  -- Check for existing payout (idempotency)
  SELECT EXISTS (
    SELECT 1 FROM transactions 
    WHERE match_id = p_match_id AND type = 'payout'
  ) INTO v_existing_payout;
  
  IF v_existing_payout THEN
    RETURN json_build_object('success', false, 'error', 'Payout already processed for this match');
  END IF;

  -- ========================
  -- PROCESS LOSER SIDE FIRST
  -- ========================
  IF v_loser_payment_mode = 'cover' THEN
    -- COVER: Payer paid all, validate and remove locked from payer ONLY
    SELECT locked_balance INTO v_loser_payer_locked 
    FROM wallets WHERE user_id = v_loser_payer_id;
    
    IF COALESCE(v_loser_payer_locked, 0) < (v_entry_fee * v_team_size) THEN
      RETURN json_build_object('success', false, 'error', 
        'Loser payer locked_balance mismatch. Expected ' || (v_entry_fee * v_team_size) || 
        ', found ' || COALESCE(v_loser_payer_locked, 0) || '. Payer: ' || v_loser_payer_id);
    END IF;
    
    UPDATE wallets
    SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
        updated_at = now()
    WHERE user_id = v_loser_payer_id;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_loser_payer_id, 'fee', v_entry_fee * v_team_size, p_match_id, 
      'Match entry (loss - covered team)', 'completed');
    
    -- Record challenge event for all losers
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = v_loser_side
    LOOP
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  ELSE
    -- SPLIT: Each member paid individually
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = v_loser_side
    LOOP
      UPDATE wallets
      SET locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant.user_id;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');
      
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- =======================
  -- PROCESS WINNER SIDE
  -- =======================
  IF v_winner_payment_mode = 'cover' THEN
    -- COVER: Payer paid all, validate and unlock + payout to payer
    SELECT locked_balance INTO v_winner_payer_locked 
    FROM wallets WHERE user_id = v_winner_payer_id;
    
    IF COALESCE(v_winner_payer_locked, 0) < (v_entry_fee * v_team_size) THEN
      RETURN json_build_object('success', false, 'error', 
        'Winner payer locked_balance mismatch. Expected ' || (v_entry_fee * v_team_size) || 
        ', found ' || COALESCE(v_winner_payer_locked, 0) || '. Payer: ' || v_winner_payer_id);
    END IF;
    
    -- Payer: unlock their stake and give them all the winnings
    UPDATE wallets
    SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
        balance = balance + (v_payout_per_winner * v_team_size),
        updated_at = now()
    WHERE user_id = v_winner_payer_id;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_payer_id, 'unlock', v_entry_fee * v_team_size, p_match_id, 
      'Entry fee returned (win - covered team)', 'completed');
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_payer_id, 'payout', v_payout_per_winner * v_team_size, p_match_id, 
      'Match winnings (covered team)', 'completed');
    
    -- Record challenge events
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = p_winner_side
    LOOP
      PERFORM record_challenge_event(v_participant.user_id, 'match_won', p_match_id);
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  ELSE
    -- SPLIT: Each member paid and gets their share
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = p_winner_side
    LOOP
      UPDATE wallets
      SET locked_balance = locked_balance - v_entry_fee,
          balance = balance + v_payout_per_winner,
          updated_at = now()
      WHERE user_id = v_participant.user_id;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'unlock', v_entry_fee, p_match_id, 'Entry fee returned (win)', 'completed');
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'payout', v_payout_per_winner, p_match_id, 'Match winnings', 'completed');
      
      PERFORM record_challenge_event(v_participant.user_id, 'match_won', p_match_id);
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- Platform fee transaction
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (v_match.creator_id, 'fee', v_platform_fee, p_match_id, 'Platform fee (10%)', 'completed');

  -- Update match status
  UPDATE matches
  SET status = 'completed',
      winner_team_side = p_winner_side,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  -- Create match result record
  INSERT INTO match_results (match_id, winner_team_side, status, created_at)
  VALUES (p_match_id, p_winner_side, 'confirmed', now())
  ON CONFLICT (match_id) DO UPDATE 
  SET winner_team_side = p_winner_side, status = 'confirmed', updated_at = now();

  RETURN json_build_object(
    'success', true, 
    'message', 'Match finalized successfully',
    'winner_side', p_winner_side
  );
END;
$$;