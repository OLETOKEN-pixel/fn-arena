-- =====================================================
-- MATCH SYSTEM REFACTOR: Single Source of Truth
-- Consolidates all match RPCs into a clean, unified system
-- =====================================================

-- ====================
-- 1. HELPER FUNCTIONS
-- ====================

-- has_active_match: Check if user is in an active match
CREATE OR REPLACE FUNCTION public.has_active_match(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = p_user_id
    AND m.status NOT IN ('finished', 'completed', 'admin_resolved', 'expired', 'canceled')
  );
END;
$$;

-- ====================
-- 2. UNIFIED RESULT DECLARATION
-- ====================

-- declare_result: Single entry point for all match types
-- Replaces: declare_match_result, submit_match_result, submit_team_result
CREATE OR REPLACE FUNCTION public.declare_result(
  p_match_id UUID,
  p_result TEXT  -- 'WIN' or 'LOSS'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_match RECORD;
  v_participant RECORD;
  v_user_team_side TEXT;
  v_is_team_match BOOLEAN;
  v_is_captain BOOLEAN;
  v_team_a_result TEXT;
  v_team_b_result TEXT;
  v_other_side_result TEXT;
  v_winner_side TEXT;
  v_finalize_result jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate result
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result. Use WIN or LOSS');
  END IF;

  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match status
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in a valid state for result declaration');
  END IF;

  -- Get user's participant record
  SELECT * INTO v_participant 
  FROM match_participants 
  WHERE match_id = p_match_id AND user_id = v_user_id;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant in this match');
  END IF;

  v_user_team_side := v_participant.team_side;
  v_is_team_match := v_match.team_size > 1;

  -- For team matches, check if user is captain
  IF v_is_team_match THEN
    IF v_user_team_side = 'A' THEN
      v_is_captain := (v_user_id = v_match.creator_id);
    ELSE
      -- Captain of Team B is first to join that side
      SELECT (mp.user_id = v_user_id) INTO v_is_captain
      FROM match_participants mp
      WHERE mp.match_id = p_match_id AND mp.team_side = 'B'
      ORDER BY mp.joined_at ASC
      LIMIT 1;
    END IF;

    IF NOT v_is_captain THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only the team captain can declare the result');
    END IF;
  END IF;

  -- Check if already declared (idempotency)
  IF v_is_team_match THEN
    -- For team match, check if ANY team member already declared
    SELECT result_choice INTO v_team_a_result
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = 'A' AND result_choice IS NOT NULL
    LIMIT 1;
    
    SELECT result_choice INTO v_team_b_result
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = 'B' AND result_choice IS NOT NULL
    LIMIT 1;
    
    IF (v_user_team_side = 'A' AND v_team_a_result IS NOT NULL) OR 
       (v_user_team_side = 'B' AND v_team_b_result IS NOT NULL) THEN
      RETURN jsonb_build_object(
        'success', true, 
        'status', 'already_submitted',
        'message', 'Result already declared for your team'
      );
    END IF;
  ELSE
    -- For 1v1, check user's own result
    IF v_participant.result_choice IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true, 
        'status', 'already_submitted',
        'message', 'You have already declared your result'
      );
    END IF;
  END IF;

  -- Record the result choice
  IF v_is_team_match THEN
    -- Update all team members with the same result
    UPDATE match_participants
    SET result_choice = p_result, result_at = now()
    WHERE match_id = p_match_id AND team_side = v_user_team_side;
  ELSE
    -- Update just this participant
    UPDATE match_participants
    SET result_choice = p_result, result_at = now()
    WHERE id = v_participant.id;
  END IF;

  -- Refresh the results after update
  SELECT result_choice INTO v_team_a_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'A' AND result_choice IS NOT NULL
  LIMIT 1;
  
  SELECT result_choice INTO v_team_b_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'B' AND result_choice IS NOT NULL
  LIMIT 1;

  -- Check if both sides have declared
  IF v_team_a_result IS NULL OR v_team_b_result IS NULL THEN
    -- Update match to result_pending if not already
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id AND status = 'in_progress';
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending',
      'message', 'Result recorded. Waiting for the other side to declare.'
    );
  END IF;

  -- Both sides have declared - determine outcome
  IF (v_team_a_result = 'WIN' AND v_team_b_result = 'LOSS') THEN
    v_winner_side := 'A';
  ELSIF (v_team_a_result = 'LOSS' AND v_team_b_result = 'WIN') THEN
    v_winner_side := 'B';
  ELSE
    -- Conflict: both claim WIN or both claim LOSS
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'disputed',
      'message', 'Results conflict. An admin will review this match.'
    );
  END IF;

  -- Finalize the match with the determined winner
  v_finalize_result := public.finalize_match_payout(p_match_id, v_winner_side);
  
  IF (v_finalize_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'winner_side', v_winner_side,
      'winner_id', v_finalize_result->>'winner_id',
      'message', 'Match completed successfully!'
    );
  ELSE
    RETURN v_finalize_result;
  END IF;
END;
$$;


-- ====================
-- 3. UNIFIED FINALIZATION FUNCTION
-- ====================

-- finalize_match_payout: Handles all payouts for both 1v1 and team matches
-- Replaces: complete_match_payout, finalize_team_match
CREATE OR REPLACE FUNCTION public.finalize_match_payout(
  p_match_id UUID,
  p_winner_side TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_entry_fee NUMERIC;
  v_team_size INT;
  v_total_pool NUMERIC;
  v_platform_fee NUMERIC;
  v_prize_pool NUMERIC;
  v_loser_side TEXT;
  v_winner_team_id UUID;
  v_loser_team_id UUID;
  v_winner_payment_mode TEXT;
  v_loser_payment_mode TEXT;
  v_winner_captain_id UUID;
  v_loser_captain_id UUID;
  v_payout_per_member NUMERIC;
  v_participant RECORD;
  v_existing_payout BOOLEAN;
  v_winner_user_id UUID;
BEGIN
  IF p_winner_side NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid winner side');
  END IF;

  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for finalization');
  END IF;

  -- Idempotency check: prevent double payout
  SELECT EXISTS(
    SELECT 1 FROM transactions 
    WHERE match_id = p_match_id AND type = 'payout'
  ) INTO v_existing_payout;

  IF v_existing_payout THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout already processed', 'status', 'already_paid');
  END IF;

  v_entry_fee := v_match.entry_fee;
  v_team_size := v_match.team_size;
  v_loser_side := CASE WHEN p_winner_side = 'A' THEN 'B' ELSE 'A' END;
  
  -- Calculate prize pool: entry_fee * team_size * 2 teams, 10% fee
  v_total_pool := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pool * 0.10;
  v_prize_pool := v_total_pool - v_platform_fee;
  
  -- Determine payment modes and team IDs
  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
  ELSE
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
  END IF;
  
  -- Get captains (first joined player on each side)
  SELECT user_id INTO v_winner_captain_id
  FROM match_participants 
  WHERE match_id = p_match_id AND team_side = p_winner_side 
  ORDER BY joined_at ASC LIMIT 1;
  
  SELECT user_id INTO v_loser_captain_id
  FROM match_participants 
  WHERE match_id = p_match_id AND team_side = v_loser_side 
  ORDER BY joined_at ASC LIMIT 1;

  -- Store winner ID for return
  v_winner_user_id := v_winner_captain_id;

  -- ========================================
  -- PROCESS LOSER SIDE (unlock locked funds)
  -- ========================================
  IF v_team_size = 1 THEN
    -- 1v1 match: simple deduction
    UPDATE wallets
    SET locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = v_loser_captain_id AND id IS NOT NULL;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_loser_captain_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');
    
    PERFORM record_challenge_event(v_loser_captain_id, 'match_completed', p_match_id);
    
  ELSIF v_loser_payment_mode = 'cover' THEN
    -- COVER: Captain paid all, remove all locked from captain ONLY
    UPDATE wallets
    SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
        updated_at = now()
    WHERE user_id = v_loser_captain_id AND id IS NOT NULL;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_loser_captain_id, 'fee', v_entry_fee * v_team_size, p_match_id, 
      'Match entry (loss - covered team)', 'completed');
    
    -- Record event for all losers
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
      WHERE user_id = v_participant.user_id AND id IS NOT NULL;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');
      
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- ========================================
  -- PROCESS WINNER SIDE (payout winnings)
  -- ========================================
  IF v_team_size = 1 THEN
    -- 1v1 match: simple payout
    UPDATE wallets
    SET balance = balance + v_prize_pool,
        locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = v_winner_captain_id AND id IS NOT NULL;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_captain_id, 'payout', v_prize_pool, p_match_id, 'Match winnings', 'completed');
    
    PERFORM record_challenge_event(v_winner_captain_id, 'match_completed', p_match_id);
    
  ELSIF v_winner_payment_mode = 'cover' THEN
    -- COVER: Captain paid all, captain receives all winnings
    UPDATE wallets
    SET balance = balance + v_prize_pool,
        locked_balance = locked_balance - (v_entry_fee * v_team_size),
        updated_at = now()
    WHERE user_id = v_winner_captain_id AND id IS NOT NULL;
    
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_winner_captain_id, 'payout', v_prize_pool, p_match_id, 
      'Match winnings (covered team)', 'completed');
    
    -- Record event for all winners
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = p_winner_side
    LOOP
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  ELSE
    -- SPLIT: Each member paid individually, distribute prize equally
    v_payout_per_member := v_prize_pool / v_team_size;
    
    FOR v_participant IN 
      SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = p_winner_side
    LOOP
      UPDATE wallets
      SET balance = balance + v_payout_per_member,
          locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant.user_id AND id IS NOT NULL;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant.user_id, 'payout', v_payout_per_member, p_match_id, 'Match winnings', 'completed');
      
      PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- Platform fee
  UPDATE platform_wallet 
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;

  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);

  -- Update match status
  UPDATE matches 
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;

  -- Record result
  INSERT INTO match_results (match_id, winner_user_id, winner_team_id, status)
  VALUES (p_match_id, v_winner_captain_id, v_winner_team_id, 'confirmed')
  ON CONFLICT (match_id) DO UPDATE SET 
    winner_user_id = v_winner_captain_id,
    winner_team_id = v_winner_team_id,
    status = 'confirmed',
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'message', 'Match finalized successfully',
    'winner_id', v_winner_captain_id,
    'winner_team_id', v_winner_team_id,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee
  );
END;
$$;


-- ====================
-- 4. KEEP OLD FUNCTIONS AS WRAPPERS (backward compatibility)
-- ====================

-- submit_match_result: wrapper for 1v1 (backward compatible)
CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match_id UUID,
  p_result TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.declare_result(p_match_id, p_result);
END;
$$;

-- submit_team_result: wrapper for teams (backward compatible)
CREATE OR REPLACE FUNCTION public.submit_team_result(
  p_match_id UUID,
  p_result TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.declare_result(p_match_id, p_result);
END;
$$;

-- Keep finalize_team_match as wrapper
CREATE OR REPLACE FUNCTION public.finalize_team_match(
  p_match_id UUID,
  p_winner_side TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.finalize_match_payout(p_match_id, p_winner_side);
END;
$$;

-- Keep complete_match_payout as wrapper for 1v1
CREATE OR REPLACE FUNCTION public.complete_match_payout(
  p_match_id UUID,
  p_winner_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_side TEXT;
BEGIN
  -- Determine winner side from user_id
  SELECT team_side INTO v_winner_side
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = p_winner_user_id
  LIMIT 1;
  
  IF v_winner_side IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Winner not found in match');
  END IF;
  
  RETURN public.finalize_match_payout(p_match_id, v_winner_side);
END;
$$;


-- ====================
-- 5. NORMALIZE EXISTING MATCH STATUSES
-- ====================

-- Update any legacy statuses to standard ones
UPDATE matches SET status = 'in_progress' WHERE status IN ('full', 'started');
UPDATE matches SET status = 'finished' WHERE status = 'completed';