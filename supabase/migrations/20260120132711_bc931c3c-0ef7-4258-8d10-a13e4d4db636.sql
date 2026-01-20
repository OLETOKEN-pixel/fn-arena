-- Drop and recreate join_match_v2 with JSON return type

DROP FUNCTION IF EXISTS public.join_match_v2(uuid);

CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_match record;
  v_entry_fee numeric;
  v_balance numeric;
  v_participant_count int;
  v_max_participants int;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get match details with lock
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match is open
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;

  -- Check match not expired
  IF v_match.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Match has expired');
  END IF;

  -- Check not already in match
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You are already in this match');
  END IF;

  -- Check user doesn't have another active match
  IF public.has_active_match(v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'You already have an active match');
  END IF;

  -- For team matches (team_size > 1), don't allow direct join
  IF v_match.team_size > 1 THEN
    RETURN json_build_object('success', false, 'error', 'Team matches require joining with a team');
  END IF;

  -- Get entry fee and check balance
  v_entry_fee := v_match.entry_fee;
  
  SELECT balance INTO v_balance
  FROM public.wallets
  WHERE user_id = v_user_id;

  IF v_balance IS NULL OR v_balance < v_entry_fee THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Count current participants
  SELECT COUNT(*) INTO v_participant_count
  FROM public.match_participants
  WHERE match_id = p_match_id;

  v_max_participants := v_match.team_size * 2;

  IF v_participant_count >= v_max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Match is full');
  END IF;

  -- Lock funds
  UPDATE public.wallets
  SET balance = balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Create transaction record
  INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
  VALUES (v_user_id, 'match_entry', -v_entry_fee, p_match_id, 'Match entry fee locked', 'completed');

  -- Add participant with ready = true for 1v1
  INSERT INTO public.match_participants (match_id, user_id, team_side, ready, ready_at)
  VALUES (p_match_id, v_user_id, 'B', true, now());

  -- Update match status to ready_check if now full (for 1v1, 2 players)
  IF v_participant_count + 1 >= v_max_participants THEN
    UPDATE public.matches
    SET status = 'ready_check',
        started_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN json_build_object('success', true, 'status', 'joined');
END;
$$;