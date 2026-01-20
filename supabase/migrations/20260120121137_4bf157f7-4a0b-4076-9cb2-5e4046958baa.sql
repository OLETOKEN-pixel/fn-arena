-- =====================================================
-- FIX CRITICAL: Drop and recreate functions + Storage Policy
-- =====================================================

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.finalize_team_match(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_match_payout(UUID, UUID);
DROP FUNCTION IF EXISTS public.submit_match_result(UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_team_result(UUID, TEXT);

-- 1. Recreate finalize_team_match with WHERE clause fix
CREATE FUNCTION public.finalize_team_match(p_match_id UUID, p_winner_side TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_winner_team_id UUID;
  v_loser_team_id UUID;
  v_entry_fee NUMERIC;
  v_team_size INT;
  v_total_pot NUMERIC;
  v_platform_fee NUMERIC;
  v_winner_payout NUMERIC;
  v_payout_per_player NUMERIC;
  v_winner_participants UUID[];
  v_loser_participants UUID[];
  v_participant_id UUID;
BEGIN
  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state for finalization');
  END IF;
  
  -- Determine winner/loser teams
  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
  ELSIF p_winner_side = 'B' THEN
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid winner_side');
  END IF;
  
  v_entry_fee := v_match.entry_fee;
  v_team_size := COALESCE(v_match.team_size, 1);
  v_total_pot := v_entry_fee * 2 * v_team_size;
  v_platform_fee := v_total_pot * 0.10;
  v_winner_payout := v_total_pot - v_platform_fee;
  v_payout_per_player := v_winner_payout / v_team_size;
  
  -- Get winner participants
  SELECT ARRAY_AGG(user_id) INTO v_winner_participants
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = p_winner_side;
  
  -- Get loser participants  
  SELECT ARRAY_AGG(user_id) INTO v_loser_participants
  FROM match_participants
  WHERE match_id = p_match_id AND team_side != p_winner_side;
  
  -- Release locked funds and pay winners
  IF v_winner_participants IS NOT NULL THEN
    FOREACH v_participant_id IN ARRAY v_winner_participants
    LOOP
      UPDATE wallets 
      SET locked_balance = locked_balance - v_entry_fee,
          balance = balance + v_payout_per_player,
          updated_at = now()
      WHERE user_id = v_participant_id;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant_id, 'match_win', v_payout_per_player, p_match_id, 'Match winnings', 'completed');
      
      PERFORM record_challenge_event(v_participant_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;
  
  -- Release locked funds for losers
  IF v_loser_participants IS NOT NULL THEN
    FOREACH v_participant_id IN ARRAY v_loser_participants
    LOOP
      UPDATE wallets 
      SET locked_balance = locked_balance - v_entry_fee,
          updated_at = now()
      WHERE user_id = v_participant_id;
      
      INSERT INTO transactions (user_id, type, amount, match_id, description, status)
      VALUES (v_participant_id, 'match_loss', -v_entry_fee, p_match_id, 'Match loss', 'completed');
      
      PERFORM record_challenge_event(v_participant_id, 'match_completed', p_match_id);
    END LOOP;
  END IF;
  
  -- Record platform fee - CRITICAL: WHERE clause required
  UPDATE platform_wallet 
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;
  
  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
  
  -- Update match status
  UPDATE matches 
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;
  
  -- Update match result
  INSERT INTO match_results (match_id, winner_team_id, status)
  VALUES (p_match_id, v_winner_team_id, 'confirmed')
  ON CONFLICT (match_id) DO UPDATE SET 
    winner_team_id = v_winner_team_id, 
    status = 'confirmed', 
    updated_at = now();
  
  RETURN jsonb_build_object(
    'success', true, 
    'status', 'completed',
    'message', 'Match finalized successfully',
    'winner_team_id', v_winner_team_id
  );
END;
$$;

-- 2. Recreate complete_match_payout with WHERE clause fix
CREATE FUNCTION public.complete_match_payout(p_match_id UUID, p_winner_user_id UUID)
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
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending', 'disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
  END IF;
  
  v_entry_fee := v_match.entry_fee;
  v_total_pot := v_entry_fee * 2;
  v_platform_fee := v_total_pot * 0.10;
  v_winner_payout := v_total_pot - v_platform_fee;
  
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
  
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (p_winner_user_id, 'match_win', v_winner_payout, p_match_id, 'Match winnings', 'completed');
  
  PERFORM record_challenge_event(p_winner_user_id, 'match_completed', p_match_id);
  
  -- Loser: release locked
  UPDATE wallets 
  SET locked_balance = locked_balance - v_entry_fee,
      updated_at = now()
  WHERE user_id = v_loser_user_id;
  
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (v_loser_user_id, 'match_loss', -v_entry_fee, p_match_id, 'Match loss', 'completed');
  
  PERFORM record_challenge_event(v_loser_user_id, 'match_completed', p_match_id);
  
  -- Platform fee - CRITICAL: WHERE clause required
  UPDATE platform_wallet 
  SET balance = balance + v_platform_fee, updated_at = now()
  WHERE id IS NOT NULL;
  
  INSERT INTO platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
  
  UPDATE matches 
  SET status = 'finished', finished_at = now()
  WHERE id = p_match_id;
  
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

-- 3. Recreate submit_match_result - independent declarations
CREATE FUNCTION public.submit_match_result(p_match_id UUID, p_result TEXT)
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
  
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
  END IF;
  
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;
  
  IF v_participant.result_choice IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already submitted', 'status', 'already_submitted');
  END IF;
  
  -- Save caller's declaration
  UPDATE match_participants
  SET result_choice = p_result, result_at = now()
  WHERE id = v_participant.id;
  
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;
  
  SELECT * INTO v_opponent
  FROM match_participants
  WHERE match_id = p_match_id AND user_id != v_caller_id
  LIMIT 1;
  
  IF v_opponent.result_choice IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Waiting for opponent');
  END IF;
  
  -- Both submitted - check agreement
  IF (p_result = 'WIN' AND v_opponent.result_choice = 'LOSS') OR 
     (p_result = 'LOSS' AND v_opponent.result_choice = 'WIN') THEN
    IF p_result = 'WIN' THEN
      v_winner_id := v_caller_id;
    ELSE
      v_winner_id := v_opponent.user_id;
    END IF;
    
    SELECT complete_match_payout(p_match_id, v_winner_id) INTO v_payout_result;
    
    RETURN jsonb_build_object(
      'success', true, 
      'status', 'completed', 
      'message', 'Match completed',
      'winner_id', v_winner_id
    );
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    
    INSERT INTO match_results (match_id, status, dispute_reason)
    VALUES (p_match_id, 'disputed', 'Both claimed same result')
    ON CONFLICT (match_id) DO UPDATE SET 
      status = 'disputed', 
      dispute_reason = 'Both claimed same result',
      updated_at = now();
    
    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Results conflict - disputed');
  END IF;
END;
$$;

-- 4. Recreate submit_team_result - independent team declarations
CREATE FUNCTION public.submit_team_result(p_match_id UUID, p_result TEXT)
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
  v_payout_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result');
  END IF;
  
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
  END IF;
  
  SELECT * INTO v_participant
  FROM match_participants
  WHERE match_id = p_match_id AND user_id = v_caller_id;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;
  
  v_caller_side := v_participant.team_side;
  
  IF EXISTS (
    SELECT 1 FROM match_participants 
    WHERE match_id = p_match_id 
    AND team_side = v_caller_side 
    AND result_choice IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team already submitted', 'status', 'already_submitted');
  END IF;
  
  -- Save team's declaration
  UPDATE match_participants
  SET result_choice = p_result, result_at = now()
  WHERE match_id = p_match_id AND team_side = v_caller_side;
  
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
  END IF;
  
  SELECT result_choice INTO v_team_a_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'A' AND result_choice IS NOT NULL
  LIMIT 1;
  
  SELECT result_choice INTO v_team_b_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side = 'B' AND result_choice IS NOT NULL
  LIMIT 1;
  
  IF v_team_a_result IS NULL OR v_team_b_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Waiting for other team');
  END IF;
  
  -- Both submitted - check agreement
  IF (v_team_a_result = 'WIN' AND v_team_b_result = 'LOSS') THEN
    v_winner_side := 'A';
  ELSIF (v_team_a_result = 'LOSS' AND v_team_b_result = 'WIN') THEN
    v_winner_side := 'B';
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    
    INSERT INTO match_results (match_id, status, dispute_reason)
    VALUES (p_match_id, 'disputed', 'Teams claimed same result')
    ON CONFLICT (match_id) DO UPDATE SET 
      status = 'disputed', 
      dispute_reason = 'Teams claimed same result',
      updated_at = now();
    
    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Results conflict - disputed');
  END IF;
  
  SELECT finalize_team_match(p_match_id, v_winner_side) INTO v_payout_result;
  
  RETURN jsonb_build_object(
    'success', true, 
    'status', 'completed', 
    'message', 'Match completed',
    'winner_side', v_winner_side
  );
END;
$$;

-- 5. Fix storage RLS policy - include ALL match statuses
DROP POLICY IF EXISTS "Match participants can upload proof files" ON storage.objects;

CREATE POLICY "Match participants can upload proof files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'proofs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id
        WHERE mp.user_id = auth.uid()
        AND mp.match_id::text = split_part(name, '/', 1)
        AND m.status IN (
            'open', 'full', 'ready_check', 'in_progress', 'result_pending',
            'started', 'disputed', 'completed', 'finished', 'admin_resolved'
        )
    )
);