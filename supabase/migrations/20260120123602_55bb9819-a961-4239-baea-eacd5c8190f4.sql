-- =====================================================
-- FIX CRITICAL: Result Declaration + Proof Upload
-- =====================================================

-- =====================================================
-- 1. CREATE SERVER-SIDE RPC FOR PROOF UPLOAD
-- Uses auth.uid() to avoid client-side user_id mismatch
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_match_proof(
  p_match_id UUID,
  p_image_url TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_match RECORD;
  v_is_participant BOOLEAN;
  v_proof_id UUID;
BEGIN
  -- Auth check
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Validate match state
  IF v_match.status NOT IN ('in_progress', 'result_pending', 'ready_check', 'full', 'started', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for proof upload');
  END IF;

  -- Check if caller is participant
  SELECT EXISTS(
    SELECT 1 FROM match_participants 
    WHERE match_id = p_match_id AND user_id = v_caller_id
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant in this match');
  END IF;

  -- Insert proof record using auth.uid()
  INSERT INTO match_proofs (match_id, user_id, image_url)
  VALUES (p_match_id, v_caller_id, p_image_url)
  RETURNING id INTO v_proof_id;

  RETURN jsonb_build_object(
    'success', true,
    'proof_id', v_proof_id,
    'message', 'Proof uploaded successfully'
  );
END;
$$;

-- =====================================================
-- 2. FIX complete_match_payout: change transaction types
-- 'match_win' -> 'payout', 'match_loss' -> 'fee'
-- =====================================================
CREATE OR REPLACE FUNCTION public.complete_match_payout(p_match_id UUID, p_winner_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_loser_user_id UUID;
  v_entry_fee NUMERIC;
  v_total_pot NUMERIC;
  v_platform_fee NUMERIC;
  v_winner_payout NUMERIC;
  v_existing_payout BOOLEAN;
BEGIN
  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Allow payout from multiple valid states
  IF v_match.status NOT IN ('in_progress', 'result_pending', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
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
  v_total_pot := v_entry_fee * 2;
  v_platform_fee := v_total_pot * 0.10;
  v_winner_payout := v_total_pot - v_platform_fee;
  
  -- Find loser
  SELECT user_id INTO v_loser_user_id
  FROM match_participants
  WHERE match_id = p_match_id AND user_id != p_winner_user_id
  LIMIT 1;
  
  -- Winner: release locked + add winnings
  UPDATE wallets 
  SET locked_balance = locked_balance - v_entry_fee,
      balance = balance + v_winner_payout,
      updated_at = now()
  WHERE user_id = p_winner_user_id;
  
  -- FIXED: Use 'payout' instead of 'match_win'
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (p_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Match winnings', 'completed');
  
  PERFORM record_challenge_event(p_winner_user_id, 'match_completed', p_match_id);
  
  -- Loser: release locked
  UPDATE wallets 
  SET locked_balance = locked_balance - v_entry_fee,
      updated_at = now()
  WHERE user_id = v_loser_user_id;
  
  -- FIXED: Use 'fee' instead of 'match_loss' (amount as positive, description explains it's a loss)
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');
  
  PERFORM record_challenge_event(v_loser_user_id, 'match_completed', p_match_id);
  
  -- Platform fee - CRITICAL: WHERE clause required
  UPDATE platform_wallet 
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;
  
  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
  
  -- Update match status
  UPDATE matches 
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;
  
  -- Record result
  INSERT INTO match_results (match_id, winner_user_id, status)
  VALUES (p_match_id, p_winner_user_id, 'confirmed')
  ON CONFLICT (match_id) DO UPDATE SET 
    winner_user_id = p_winner_user_id, 
    status = 'confirmed', 
    updated_at = now();
  
  RETURN jsonb_build_object(
    'success', true, 
    'status', 'completed',
    'message', 'Payout completed successfully',
    'winner_user_id', p_winner_user_id
  );
END;
$$;

-- =====================================================
-- 3. FIX finalize_team_match: change transaction types
-- 'match_win' -> 'payout', 'match_loss' -> 'fee'
-- =====================================================
CREATE OR REPLACE FUNCTION public.finalize_team_match(p_match_id UUID, p_winner_side TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_entry_fee NUMERIC;
  v_team_size INT;
  v_total_pot NUMERIC;
  v_platform_fee NUMERIC;
  v_winner_pot NUMERIC;
  v_payout_per_player NUMERIC;
  v_winner_team_id UUID;
  v_loser_team_id UUID;
  v_winner_participants UUID[];
  v_loser_participants UUID[];
  v_participant_id UUID;
  v_existing_payout BOOLEAN;
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
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
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
  v_total_pot := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pot * 0.10;
  v_winner_pot := v_total_pot - v_platform_fee;
  v_payout_per_player := v_winner_pot / v_team_size;

  -- Determine winner/loser teams
  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
  ELSE
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
  END IF;

  -- Get participant arrays
  SELECT array_agg(user_id) INTO v_winner_participants
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = p_winner_side;

  SELECT array_agg(user_id) INTO v_loser_participants
  FROM match_participants
  WHERE match_id = p_match_id AND team_side != p_winner_side;

  -- Process winners
  IF v_winner_participants IS NOT NULL THEN
    FOREACH v_participant_id IN ARRAY v_winner_participants
    LOOP
      UPDATE wallets 
      SET locked_balance = locked_balance - v_entry_fee,
          balance = balance + v_payout_per_player,
          updated_at = now()
      WHERE user_id = v_participant_id;
      
      -- FIXED: Use 'payout' instead of 'match_win'
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant_id, 'payout', v_payout_per_player, p_match_id, 'Match winnings', 'completed');
      
      PERFORM record_challenge_event(v_participant_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- Process losers
  IF v_loser_participants IS NOT NULL THEN
    FOREACH v_participant_id IN ARRAY v_loser_participants
    LOOP
      UPDATE wallets 
      SET locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant_id;
      
      -- FIXED: Use 'fee' instead of 'match_loss'
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant_id, 'fee', v_entry_fee, p_match_id, 'Match entry (loss)', 'completed');
      
      PERFORM record_challenge_event(v_participant_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;

  -- Platform fee - CRITICAL: WHERE clause required
  UPDATE platform_wallet 
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;

  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);

  -- Update match status
  UPDATE matches 
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;

  -- Record result
  INSERT INTO match_results (match_id, winner_team_id, status)
  VALUES (p_match_id, v_winner_team_id, 'confirmed')
  ON CONFLICT (match_id) DO UPDATE SET 
    winner_team_id = v_winner_team_id,
    status = 'confirmed',
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'message', 'Team match finalized successfully',
    'winner_team_id', v_winner_team_id
  );
END;
$$;

-- =====================================================
-- 4. FIX submit_match_result: ensure independent declarations
-- and proper conflict detection
-- =====================================================
CREATE OR REPLACE FUNCTION public.submit_match_result(p_match_id UUID, p_result TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_caller_id UUID := auth.uid();
  v_participant RECORD;
  v_opponent RECORD;
  v_winner_id UUID;
  v_payout_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result');
  END IF;
  
  -- Lock match row for atomic operation
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Allow submissions only in valid states
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for result submission');
  END IF;
  
  -- Get caller's participant record
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id
  FOR UPDATE;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;
  
  -- Idempotency: if already submitted, return success without changing
  IF v_participant.result_choice IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'status', 'already_submitted',
      'message', 'You have already submitted your result'
    );
  END IF;
  
  -- Save caller's declaration ONLY
  UPDATE match_participants
  SET result_choice = p_result, result_at = now()
  WHERE id = v_participant.id;
  
  -- Move to result_pending if first submission
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;
  
  -- Get opponent's record (fresh read to see their choice)
  SELECT * INTO v_opponent
  FROM match_participants
  WHERE match_id = p_match_id AND user_id != v_caller_id
  LIMIT 1;
  
  -- If opponent hasn't submitted yet, return pending
  IF v_opponent.result_choice IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending',
      'message', 'Waiting for opponent to submit their result'
    );
  END IF;
  
  -- Both have submitted - check for agreement
  -- Caller says WIN + Opponent says LOSS = Caller wins
  -- Caller says LOSS + Opponent says WIN = Opponent wins
  IF (p_result = 'WIN' AND v_opponent.result_choice = 'LOSS') THEN
    v_winner_id := v_caller_id;
  ELSIF (p_result = 'LOSS' AND v_opponent.result_choice = 'WIN') THEN
    v_winner_id := v_opponent.user_id;
  ELSE
    -- Conflict: both WIN or both LOSS
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    
    INSERT INTO match_results (match_id, status, dispute_reason)
    VALUES (p_match_id, 'disputed', 
      CASE 
        WHEN p_result = 'WIN' AND v_opponent.result_choice = 'WIN' THEN 'Both players claimed victory'
        ELSE 'Both players claimed defeat'
      END
    )
    ON CONFLICT (match_id) DO UPDATE SET 
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      updated_at = now();
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'disputed',
      'message', 'Results conflict - match sent to admin for review'
    );
  END IF;
  
  -- Agreement reached - process payout
  v_payout_result := complete_match_payout(p_match_id, v_winner_id);
  
  IF (v_payout_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'message', 'Match completed successfully',
      'winner_id', v_winner_id
    );
  ELSE
    RETURN v_payout_result;
  END IF;
END;
$$;

-- =====================================================
-- 5. FIX submit_team_result: ensure independent team declarations
-- =====================================================
CREATE OR REPLACE FUNCTION public.submit_team_result(p_match_id UUID, p_result TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_caller_id UUID := auth.uid();
  v_participant RECORD;
  v_caller_side TEXT;
  v_team_a_result TEXT;
  v_team_b_result TEXT;
  v_winner_side TEXT;
  v_finalize_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result');
  END IF;
  
  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
  END IF;
  
  -- Get caller's participant and side
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id
  FOR UPDATE;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;
  
  v_caller_side := v_participant.team_side;
  
  -- Check if caller's team already submitted
  IF EXISTS(
    SELECT 1 FROM match_participants 
    WHERE match_id = p_match_id 
      AND team_side = v_caller_side 
      AND result_choice IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'status', 'already_submitted',
      'message', 'Your team has already submitted a result'
    );
  END IF;
  
  -- Update all team members with the result (team-wide declaration)
  UPDATE match_participants
  SET result_choice = p_result, result_at = now()
  WHERE match_id = p_match_id AND team_side = v_caller_side;
  
  -- Move to result_pending if first submission
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;
  
  -- Get team results
  SELECT result_choice INTO v_team_a_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'A' AND result_choice IS NOT NULL
  LIMIT 1;
  
  SELECT result_choice INTO v_team_b_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'B' AND result_choice IS NOT NULL
  LIMIT 1;
  
  -- If other team hasn't submitted, return pending
  IF v_team_a_result IS NULL OR v_team_b_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending',
      'message', 'Waiting for opponent team to submit their result'
    );
  END IF;
  
  -- Both teams submitted - check for agreement
  IF (v_team_a_result = 'WIN' AND v_team_b_result = 'LOSS') THEN
    v_winner_side := 'A';
  ELSIF (v_team_a_result = 'LOSS' AND v_team_b_result = 'WIN') THEN
    v_winner_side := 'B';
  ELSE
    -- Conflict
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    
    INSERT INTO match_results (match_id, status, dispute_reason)
    VALUES (p_match_id, 'disputed',
      CASE 
        WHEN v_team_a_result = 'WIN' AND v_team_b_result = 'WIN' THEN 'Both teams claimed victory'
        ELSE 'Both teams claimed defeat'
      END
    )
    ON CONFLICT (match_id) DO UPDATE SET 
      status = 'disputed',
      dispute_reason = EXCLUDED.dispute_reason,
      updated_at = now();
    
    RETURN jsonb_build_object(
      'success', true,
      'status', 'disputed',
      'message', 'Results conflict - match sent to admin for review'
    );
  END IF;
  
  -- Agreement - finalize team match
  v_finalize_result := finalize_team_match(p_match_id, v_winner_side);
  
  IF (v_finalize_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'completed',
      'message', 'Match completed successfully',
      'winner', v_winner_side
    );
  ELSE
    RETURN v_finalize_result;
  END IF;
END;
$$;