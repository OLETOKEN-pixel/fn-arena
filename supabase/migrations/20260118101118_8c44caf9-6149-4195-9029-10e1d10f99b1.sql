-- First drop the old function to change return type
DROP FUNCTION IF EXISTS public.join_match_v2(uuid);

-- Recreate join_match_v2 with active match check (1v1 only)
CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_wallet RECORD;
  v_entry_fee numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Check if user has an active match
  IF has_active_match(v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Hai già un match attivo. Completa il match corrente prima di unirti ad altri.');
  END IF;
  
  -- Get match details
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  
  IF v_match.creator_id = v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;
  
  -- This RPC is for 1v1 only
  IF v_match.team_size != 1 THEN
    RETURN json_build_object('success', false, 'error', 'Per i match a squadre usa join_team_match');
  END IF;
  
  -- Check if already joined
  IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = p_match_id AND user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already joined this match');
  END IF;
  
  v_entry_fee := v_match.entry_fee;
  
  -- Get wallet and check balance
  SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  
  IF v_wallet IS NULL OR v_wallet.balance < v_entry_fee THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Lock funds
  UPDATE wallets 
  SET balance = balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee,
      updated_at = now()
  WHERE user_id = v_user_id;
  
  -- Create transaction record
  INSERT INTO transactions (user_id, type, amount, description, match_id, status)
  VALUES (v_user_id, 'lock', v_entry_fee, 'Entry fee locked for match', p_match_id, 'completed');
  
  -- Add as participant
  INSERT INTO match_participants (match_id, user_id, team_side, status)
  VALUES (p_match_id, v_user_id, 'B', 'joined');
  
  -- Update match status to ready_check (1v1 is now full)
  UPDATE matches 
  SET status = 'ready_check'
  WHERE id = p_match_id;
  
  RETURN json_build_object('success', true, 'message', 'Joined match successfully');
END;
$$;

-- Drop and recreate create_team_match with active match check
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, text, boolean);

CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id uuid,
  p_entry_fee numeric,
  p_region text,
  p_platform text,
  p_mode text,
  p_team_size integer,
  p_first_to integer,
  p_payment_mode text,
  p_is_private boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_team RECORD;
  v_member RECORD;
  v_match_id uuid;
  v_total_fee numeric;
  v_fee_per_member numeric;
  v_active_check jsonb;
  v_accepted_count integer;
  v_insufficient_members TEXT[];
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_team.owner_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;
  
  -- Count accepted members (including owner)
  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_accepted_count != p_team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Il team deve avere esattamente ' || p_team_size || ' membri accettati');
  END IF;
  
  -- Check if any team member has an active match
  v_active_check := team_has_active_match(p_team_id);
  IF (v_active_check->>'has_active')::boolean THEN
    RETURN json_build_object('success', false, 'error', 
      (v_active_check->>'username') || ' ha già un match attivo. Tutti i membri devono essere liberi.');
  END IF;
  
  v_total_fee := p_entry_fee * p_team_size;
  v_fee_per_member := p_entry_fee;
  
  -- Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    -- Owner pays full amount
    DECLARE
      v_owner_wallet RECORD;
    BEGIN
      SELECT * INTO v_owner_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
      
      IF v_owner_wallet IS NULL OR v_owner_wallet.balance < v_total_fee THEN
        RETURN json_build_object('success', false, 'error', 'Saldo insufficiente per coprire tutti i membri');
      END IF;
      
      UPDATE wallets 
      SET balance = balance - v_total_fee,
          locked_balance = locked_balance + v_total_fee,
          updated_at = now()
      WHERE user_id = v_user_id;
      
      INSERT INTO transactions (user_id, type, amount, description, status)
      VALUES (v_user_id, 'lock', v_total_fee, 'Entry fee (cover mode) for team match', 'completed');
    END;
  ELSE
    -- Split: check balances first
    v_insufficient_members := ARRAY[]::TEXT[];
    
    FOR v_member IN 
      SELECT tm.user_id, p.username, COALESCE(w.balance, 0) as balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      LEFT JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      IF v_member.balance < v_fee_per_member THEN
        v_insufficient_members := array_append(v_insufficient_members, v_member.username);
      END IF;
    END LOOP;
    
    IF array_length(v_insufficient_members, 1) > 0 THEN
      RETURN json_build_object('success', false, 'error', 
        'Saldo insufficiente per: ' || array_to_string(v_insufficient_members, ', '));
    END IF;
    
    -- Split: each member pays their share
    FOR v_member IN 
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      UPDATE wallets 
      SET balance = balance - v_fee_per_member,
          locked_balance = locked_balance + v_fee_per_member,
          updated_at = now()
      WHERE user_id = v_member.user_id;
      
      INSERT INTO transactions (user_id, type, amount, description, status)
      VALUES (v_member.user_id, 'lock', v_fee_per_member, 'Entry fee (split mode) for team match', 'completed');
    END LOOP;
  END IF;
  
  -- Create match
  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to, 
    entry_fee, is_private, status, team_a_id, payment_mode_host,
    expires_at
  ) VALUES (
    v_user_id, 'FN', p_region, p_platform, p_mode, p_team_size, p_first_to,
    p_entry_fee, p_is_private, 'open', p_team_id, p_payment_mode,
    now() + interval '30 minutes'
  )
  RETURNING id INTO v_match_id;
  
  -- Add all team members as participants
  FOR v_member IN 
    SELECT user_id FROM team_members 
    WHERE team_id = p_team_id AND status = 'accepted'
  LOOP
    INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
    VALUES (v_match_id, v_member.user_id, p_team_id, 'A', 'joined');
  END LOOP;
  
  RETURN json_build_object('success', true, 'match_id', v_match_id);
END;
$$;

-- Drop and recreate join_team_match with active match check
DROP FUNCTION IF EXISTS public.join_team_match(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id uuid,
  p_team_id uuid,
  p_payment_mode text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_team RECORD;
  v_member RECORD;
  v_total_fee numeric;
  v_fee_per_member numeric;
  v_active_check jsonb;
  v_accepted_count integer;
  v_insufficient_members TEXT[];
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  
  IF v_match.team_size = 1 THEN
    RETURN json_build_object('success', false, 'error', 'Per i match 1v1 usa join_match_v2');
  END IF;
  
  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_team.owner_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Solo il team owner può far entrare il team in un match');
  END IF;
  
  -- Check team has exact required members
  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_accepted_count != v_match.team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Il team deve avere esattamente ' || v_match.team_size || ' membri accettati');
  END IF;
  
  -- Check if any team member has an active match
  v_active_check := team_has_active_match(p_team_id);
  IF (v_active_check->>'has_active')::boolean THEN
    RETURN json_build_object('success', false, 'error', 
      (v_active_check->>'username') || ' ha già un match attivo. Tutti i membri devono essere liberi.');
  END IF;
  
  -- Cannot join own match
  IF v_match.team_a_id = p_team_id THEN
    RETURN json_build_object('success', false, 'error', 'Non puoi unirti al tuo stesso match');
  END IF;
  
  v_total_fee := v_match.entry_fee * v_match.team_size;
  v_fee_per_member := v_match.entry_fee;
  
  -- Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    DECLARE
      v_owner_wallet RECORD;
    BEGIN
      SELECT * INTO v_owner_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
      
      IF v_owner_wallet IS NULL OR v_owner_wallet.balance < v_total_fee THEN
        RETURN json_build_object('success', false, 'error', 'Saldo insufficiente per coprire tutti i membri');
      END IF;
      
      UPDATE wallets 
      SET balance = balance - v_total_fee,
          locked_balance = locked_balance + v_total_fee,
          updated_at = now()
      WHERE user_id = v_user_id;
      
      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_user_id, 'lock', v_total_fee, 'Entry fee (cover mode) for joining team match', p_match_id, 'completed');
    END;
  ELSE
    -- Split: check balances first
    v_insufficient_members := ARRAY[]::TEXT[];
    
    FOR v_member IN 
      SELECT tm.user_id, p.username, COALESCE(w.balance, 0) as balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      LEFT JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      IF v_member.balance < v_fee_per_member THEN
        v_insufficient_members := array_append(v_insufficient_members, v_member.username);
      END IF;
    END LOOP;
    
    IF array_length(v_insufficient_members, 1) > 0 THEN
      RETURN json_build_object('success', false, 'error', 
        'Saldo insufficiente per: ' || array_to_string(v_insufficient_members, ', '));
    END IF;
    
    -- Split: each member pays their share
    FOR v_member IN 
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      UPDATE wallets 
      SET balance = balance - v_fee_per_member,
          locked_balance = locked_balance + v_fee_per_member,
          updated_at = now()
      WHERE user_id = v_member.user_id;
      
      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_fee_per_member, 'Entry fee (split mode) for joining team match', p_match_id, 'completed');
    END LOOP;
  END IF;
  
  -- Add all team members as participants (Team B)
  FOR v_member IN 
    SELECT user_id FROM team_members 
    WHERE team_id = p_team_id AND status = 'accepted'
  LOOP
    INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
    VALUES (p_match_id, v_member.user_id, p_team_id, 'B', 'joined');
  END LOOP;
  
  -- Update match with team B and set to ready_check
  UPDATE matches 
  SET team_b_id = p_team_id,
      payment_mode_joiner = p_payment_mode,
      status = 'ready_check'
  WHERE id = p_match_id;
  
  RETURN json_build_object('success', true, 'message', 'Team joined match successfully');
END;
$$;