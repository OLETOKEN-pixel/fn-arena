-- Fix finalize_team_match to properly handle COVER vs SPLIT payment modes
-- This prevents the wallets_locked_balance_check constraint violation

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
  v_loser_side := CASE WHEN p_winner_side = 'A' THEN 'B' ELSE 'A' END;
  
  -- Calculate prize pool: entry_fee * team_size * 2 teams, 10% fee
  v_total_pool := v_entry_fee * v_team_size * 2;
  v_platform_fee := v_total_pool * 0.10;
  v_prize_pool := v_total_pool - v_platform_fee;
  
  -- Determine payment modes and team IDs
  -- Team A = host, Team B = joiner
  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
  ELSE
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
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

  -- ========================================
  -- PROCESS LOSER SIDE (unlock locked funds)
  -- ========================================
  IF v_loser_payment_mode = 'cover' THEN
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
  IF v_winner_payment_mode = 'cover' THEN
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