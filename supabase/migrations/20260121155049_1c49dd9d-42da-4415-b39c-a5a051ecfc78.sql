-- Fix 1: Recreate create_team_match with correct lock amount for COVER mode
CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id uuid,
  p_game text,
  p_region text,
  p_platform text,
  p_mode text,
  p_team_size integer,
  p_first_to integer,
  p_entry_fee numeric,
  p_is_private boolean DEFAULT false,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_team teams%ROWTYPE;
  v_match_id uuid;
  v_expires_at timestamptz;
  v_active_count integer;
  v_total_lock numeric;
  v_member record;
  v_member_share numeric;
BEGIN
  -- 1. Verify caller owns the team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;

  -- 2. Check team has enough accepted members
  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id AND status = 'accepted') < p_team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team does not have enough accepted members');
  END IF;

  -- 3. Check no active match for any team member
  FOR v_member IN 
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT p_team_size
  LOOP
    SELECT COUNT(*) INTO v_active_count
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_member.user_id
      AND m.status NOT IN ('completed', 'cancelled', 'expired', 'admin_resolved');
    
    IF v_active_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more team members already have an active match');
    END IF;
  END LOOP;

  -- 4. Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    -- Owner covers the entire team: entry_fee * team_size
    v_total_lock := p_entry_fee * p_team_size;
    
    -- Check and lock funds from owner
    UPDATE wallets 
    SET balance = balance - v_total_lock,
        locked_balance = locked_balance + v_total_lock,
        updated_at = now()
    WHERE user_id = v_caller_id AND balance >= v_total_lock;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
    END IF;
    
    -- Record single transaction for owner
    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (v_caller_id, 'lock', v_total_lock, 'Match entry locked (covering team)', NULL);
    
  ELSIF p_payment_mode = 'split' THEN
    -- Each member pays their share
    v_member_share := p_entry_fee;
    
    FOR v_member IN 
      SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT p_team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - v_member_share,
          locked_balance = locked_balance + v_member_share,
          updated_at = now()
      WHERE user_id = v_member.user_id AND balance >= v_member_share;
      
      IF NOT FOUND THEN
        -- Rollback: This will be handled by transaction rollback
        RAISE EXCEPTION 'Member % has insufficient balance', v_member.user_id;
      END IF;
      
      INSERT INTO transactions (user_id, type, amount, description)
      VALUES (v_member.user_id, 'lock', v_member_share, 'Match entry locked (split)');
    END LOOP;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  -- 5. Create match
  v_expires_at := now() + interval '30 minutes';
  
  INSERT INTO matches (
    creator_id, game, region, platform, mode, team_size, first_to,
    entry_fee, is_private, status, expires_at,
    team_a_id, captain_a_user_id, host_payment_mode, host_payer_user_id
  ) VALUES (
    v_caller_id, p_game, p_region, p_platform, p_mode, p_team_size, p_first_to,
    p_entry_fee, p_is_private, 'open', v_expires_at,
    p_team_id, v_caller_id, p_payment_mode, v_caller_id
  )
  RETURNING id INTO v_match_id;

  -- 6. Add team members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, joined_at, payment_mode)
  SELECT v_match_id, tm.user_id, 'A', now(), p_payment_mode
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT p_team_size;

  -- 7. Update transaction references
  UPDATE transactions 
  SET reference_id = v_match_id 
  WHERE reference_id IS NULL 
    AND type = 'lock' 
    AND user_id IN (SELECT user_id FROM match_participants WHERE match_id = v_match_id);

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix 2: Recreate join_team_match with correct lock amount for COVER mode
CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id uuid,
  p_team_id uuid,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_match matches%ROWTYPE;
  v_team teams%ROWTYPE;
  v_total_lock numeric;
  v_member_share numeric;
  v_member record;
  v_active_count integer;
BEGIN
  -- 1. Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  IF v_match.team_b_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already has an opponent');
  END IF;

  -- 2. Verify caller owns the joining team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can join matches');
  END IF;

  -- 3. Cannot join own match
  IF v_match.team_a_id = p_team_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
  END IF;

  -- 4. Check team has enough accepted members
  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id AND status = 'accepted') < v_match.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team does not have enough accepted members');
  END IF;

  -- 5. Check no active match for any team member
  FOR v_member IN 
    SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT v_match.team_size
  LOOP
    SELECT COUNT(*) INTO v_active_count
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_member.user_id
      AND m.status NOT IN ('completed', 'cancelled', 'expired', 'admin_resolved');
    
    IF v_active_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more team members already have an active match');
    END IF;
  END LOOP;

  -- 6. Handle payment based on mode
  IF p_payment_mode = 'cover' THEN
    -- Owner covers entire team: entry_fee * team_size
    v_total_lock := v_match.entry_fee * v_match.team_size;
    
    UPDATE wallets 
    SET balance = balance - v_total_lock,
        locked_balance = locked_balance + v_total_lock,
        updated_at = now()
    WHERE user_id = v_caller_id AND balance >= v_total_lock;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
    END IF;
    
    INSERT INTO transactions (user_id, type, amount, description, reference_id)
    VALUES (v_caller_id, 'lock', v_total_lock, 'Match entry locked (covering team)', p_match_id);
    
  ELSIF p_payment_mode = 'split' THEN
    v_member_share := v_match.entry_fee;
    
    FOR v_member IN 
      SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id AND tm.status = 'accepted' LIMIT v_match.team_size
    LOOP
      UPDATE wallets 
      SET balance = balance - v_member_share,
          locked_balance = locked_balance + v_member_share,
          updated_at = now()
      WHERE user_id = v_member.user_id AND balance >= v_member_share;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Member % has insufficient balance', v_member.user_id;
      END IF;
      
      INSERT INTO transactions (user_id, type, amount, description, reference_id)
      VALUES (v_member.user_id, 'lock', v_member_share, 'Match entry locked (split)', p_match_id);
    END LOOP;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
  END IF;

  -- 7. Update match with team B info
  UPDATE matches SET
    team_b_id = p_team_id,
    captain_b_user_id = v_caller_id,
    joiner_payment_mode = p_payment_mode,
    joiner_payer_user_id = v_caller_id,
    status = 'ready_check',
    updated_at = now()
  WHERE id = p_match_id;

  -- 8. Add team B members as participants
  INSERT INTO match_participants (match_id, user_id, team_side, joined_at, payment_mode)
  SELECT p_match_id, tm.user_id, 'B', now(), p_payment_mode
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LIMIT v_match.team_size;

  RETURN jsonb_build_object('success', true, 'match_id', p_match_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix 3: Recreate declare_result to properly capture and propagate finalize errors
CREATE OR REPLACE FUNCTION public.declare_result(
  p_match_id uuid,
  p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_match matches%ROWTYPE;
  v_participant match_participants%ROWTYPE;
  v_opponent_result text;
  v_winner_side text;
  v_is_captain boolean;
  v_finalize_result jsonb;
BEGIN
  -- Validate result value
  IF p_result NOT IN ('WIN', 'LOSS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
  END IF;

  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match is in valid state for result declaration
  IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in a state that allows result declaration');
  END IF;

  -- Get caller's participation
  SELECT * INTO v_participant 
  FROM match_participants 
  WHERE match_id = p_match_id AND user_id = v_caller_id;
  
  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a participant in this match');
  END IF;

  -- For team matches (team_size > 1), only captain can declare
  IF v_match.team_size > 1 THEN
    v_is_captain := (
      (v_participant.team_side = 'A' AND v_match.captain_a_user_id = v_caller_id) OR
      (v_participant.team_side = 'B' AND v_match.captain_b_user_id = v_caller_id)
    );
    
    IF NOT v_is_captain THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only team captain can declare results');
    END IF;
  END IF;

  -- Check if this team already submitted
  IF v_participant.result_choice IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Result already declared', 'status', 'already_submitted', 'message', 'Hai già dichiarato il risultato per questo team');
  END IF;

  -- Save result for this participant (and all team members for consistency)
  UPDATE match_participants 
  SET result_choice = p_result, updated_at = now()
  WHERE match_id = p_match_id AND team_side = v_participant.team_side;

  -- Update match status to result_pending if not already
  IF v_match.status = 'in_progress' THEN
    UPDATE matches SET status = 'result_pending', updated_at = now() WHERE id = p_match_id;
  END IF;

  -- Check opponent's result
  SELECT result_choice INTO v_opponent_result
  FROM match_participants
  WHERE match_id = p_match_id AND team_side != v_participant.team_side
  LIMIT 1;

  -- If opponent hasn't declared yet, we wait
  IF v_opponent_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_opponent', 'message', 'In attesa della dichiarazione avversaria');
  END IF;

  -- Both sides have declared - determine outcome
  IF (p_result = 'WIN' AND v_opponent_result = 'LOSS') THEN
    -- Agreement: caller's team won
    v_winner_side := v_participant.team_side;
  ELSIF (p_result = 'LOSS' AND v_opponent_result = 'WIN') THEN
    -- Agreement: opponent's team won
    v_winner_side := CASE WHEN v_participant.team_side = 'A' THEN 'B' ELSE 'A' END;
  ELSE
    -- Conflict: both claim WIN or both claim LOSS -> dispute
    UPDATE matches SET status = 'disputed', updated_at = now() WHERE id = p_match_id;
    
    -- Create dispute record if match_results table exists for this purpose
    INSERT INTO match_results (match_id, status, team_a_result, team_b_result)
    VALUES (
      p_match_id, 
      'disputed',
      CASE WHEN v_participant.team_side = 'A' THEN p_result ELSE v_opponent_result END,
      CASE WHEN v_participant.team_side = 'B' THEN p_result ELSE v_opponent_result END
    )
    ON CONFLICT (match_id) DO UPDATE SET
      status = 'disputed',
      team_a_result = EXCLUDED.team_a_result,
      team_b_result = EXCLUDED.team_b_result,
      updated_at = now();
    
    RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Risultati in conflitto. Un admin esaminerà il match.');
  END IF;

  -- Agreement reached - finalize match and process payout
  -- Use SELECT INTO to capture the result instead of PERFORM (which ignores it)
  SELECT public.finalize_match_payout(p_match_id, v_winner_side) INTO v_finalize_result;
  
  -- Check if finalize succeeded
  IF v_finalize_result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Finalize returned null', 'status', 'finalize_failed');
  END IF;
  
  IF NOT COALESCE((v_finalize_result->>'success')::boolean, false) THEN
    -- Finalize failed - return the error to the frontend
    RETURN jsonb_build_object(
      'success', false, 
      'error', COALESCE(v_finalize_result->>'error', 'Unknown finalize error'),
      'status', 'finalize_failed',
      'message', 'Errore durante la finalizzazione del match. Contatta il supporto.'
    );
  END IF;

  -- Success!
  RETURN jsonb_build_object(
    'success', true, 
    'status', 'completed', 
    'winner_side', v_winner_side,
    'message', 'Match completato con successo!'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'status', 'exception');
END;
$$;