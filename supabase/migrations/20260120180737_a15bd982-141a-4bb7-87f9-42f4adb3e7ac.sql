-- Create secure RPC for 1v1 match creation with active match validation
CREATE OR REPLACE FUNCTION public.create_match_1v1(
  p_region text,
  p_platform text,
  p_mode text,
  p_first_to integer,
  p_entry_fee numeric,
  p_is_private boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_match_id uuid;
  v_balance numeric;
  v_expires_at timestamp with time zone;
BEGIN
  v_user_id := auth.uid();
  
  -- Verify authentication
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- CRITICAL CHECK: Does user already have an active match?
  IF public.has_active_match(v_user_id) THEN
    RETURN json_build_object('success', false, 'error', 
      'Hai già un match attivo. Completa o cancella il match esistente prima di crearne uno nuovo.');
  END IF;
  
  -- Verify wallet balance
  SELECT balance INTO v_balance FROM wallets WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_entry_fee THEN
    RETURN json_build_object('success', false, 'error', 'Saldo insufficiente');
  END IF;
  
  -- Set expiration to 2 hours
  v_expires_at := now() + interval '2 hours';
  
  -- Create the match
  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, status, expires_at
  ) VALUES (
    v_user_id, 'FN', p_region, p_platform, p_mode, 1, p_first_to,
    p_entry_fee, p_is_private, 'open', v_expires_at
  )
  RETURNING id INTO v_match_id;
  
  -- Lock funds in wallet
  UPDATE wallets
  SET balance = balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at = now()
  WHERE user_id = v_user_id;
  
  -- Record the transaction
  INSERT INTO transactions (user_id, type, amount, match_id, description, status)
  VALUES (v_user_id, 'lock', -p_entry_fee, v_match_id, 'Match entry fee locked', 'completed');
  
  -- Add creator as participant (team_side = 'A')
  INSERT INTO match_participants (match_id, user_id, team_side)
  VALUES (v_match_id, v_user_id, 'A');
  
  RETURN json_build_object('success', true, 'match_id', v_match_id);
END;
$$;