-- Drop existing function first
DROP FUNCTION IF EXISTS public.join_match_v2(uuid);

-- Recreate with fix: 'ready_check' instead of 'full'
CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_user_balance numeric;
  v_entry_fee numeric;
BEGIN
  -- Get match details with lock
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  
  IF v_match.status != 'open' THEN
    RAISE EXCEPTION 'Match is not open for joining';
  END IF;
  
  IF v_match.team_size != 1 THEN
    RAISE EXCEPTION 'This function is for 1v1 matches only. Use join_team_match for team matches.';
  END IF;
  
  IF v_match.creator_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot join your own match';
  END IF;
  
  IF v_match.expires_at < now() THEN
    RAISE EXCEPTION 'Match has expired';
  END IF;
  
  -- Check if user already in this match
  IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = p_match_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Already in this match';
  END IF;
  
  -- Check if user has an active match
  IF has_active_match(v_user_id) THEN
    RAISE EXCEPTION 'You already have an active match';
  END IF;
  
  v_entry_fee := v_match.entry_fee;
  
  -- Get user balance
  SELECT balance INTO v_user_balance FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  
  IF v_user_balance IS NULL OR v_user_balance < v_entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Deduct from wallet and lock
  UPDATE wallets 
  SET balance = balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee
  WHERE user_id = v_user_id;
  
  -- Record lock transaction
  INSERT INTO transactions (user_id, type, amount, description, match_id)
  VALUES (v_user_id, 'lock', v_entry_fee, 'Entry fee locked for match', p_match_id);
  
  -- Add as participant
  INSERT INTO match_participants (match_id, user_id, team_side, is_ready, payment_mode, amount_paid)
  VALUES (p_match_id, v_user_id, 'B', false, 'cover', v_entry_fee);
  
  -- Update match status to ready_check (FIX: was 'full')
  UPDATE matches 
  SET status = 'ready_check', payment_mode_joiner = 'cover'
  WHERE id = p_match_id;
END;
$$;

-- Fix match 1v1 attualmente bloccati in 'full'
UPDATE matches 
SET status = 'ready_check' 
WHERE status = 'full' 
  AND team_size = 1 
  AND (SELECT COUNT(*) FROM match_participants WHERE match_id = matches.id) = 2;