-- =====================================================
-- Fix join_match_v2: Use valid transaction type 'lock'
-- instead of invalid 'match_entry'
-- =====================================================
-- The transactions table has a CHECK constraint that only allows:
-- 'deposit', 'lock', 'unlock', 'payout', 'refund', 'fee'
--
-- 'match_entry' is NOT a valid type and causes join to fail with:
-- "new row for relation 'transactions' violates check constraint 'transactions_type_check'"

CREATE OR REPLACE FUNCTION public.join_match_v2(
  p_match_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_payment_mode text DEFAULT 'cover'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_match RECORD;
  v_existing_participation RECORD;
  v_team_record RECORD;
  v_team_member RECORD;
  v_team_members uuid[];
  v_accepted_count int;
  v_required_size int;
  v_entry_fee numeric;
  v_total_cost numeric;
  v_per_member_cost numeric;
  v_payer_balance numeric;
  v_member_balance numeric;
  v_member_id uuid;
  v_team_side text;
  v_is_host boolean := false;
  v_team_slots_taken int;
  v_inserted_participant_id uuid;
BEGIN
  -- Validate caller
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'NOT_AUTHENTICATED', 'message', 'Not authenticated');
  END IF;

  -- Lock and fetch match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_NOT_FOUND', 'message', 'Match not found');
  END IF;

  -- Must be open
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_NOT_OPEN', 'message', 'Match is not open for joining');
  END IF;

  -- Check match not expired
  IF v_match.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_EXPIRED', 'message', 'Match has expired');
  END IF;

  v_entry_fee := v_match.entry_fee;
  v_required_size := v_match.team_size;

  -- ====== STRICT BUSY CHECK ======
  -- Block if user is active participant in a non-terminal match (including self)
  SELECT mp.id, m.status, m.id as match_id
  INTO v_existing_participation
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.user_id = v_caller_id
    AND mp.status != 'left'
    AND m.status IN ('open', 'full', 'ready_check', 'in_progress', 'result_pending')
    AND m.expires_at > now()
  LIMIT 1;

  IF v_existing_participation.match_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'ALREADY_IN_MATCH', 'message', 'You are already in an active match');
  END IF;

  -- ====== 1v1 SOLO JOIN ======
  IF v_required_size = 1 THEN
    -- Check not already in this match
    IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = p_match_id AND user_id = v_caller_id AND status != 'left') THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'ALREADY_JOINED', 'message', 'Already joined this match');
    END IF;

    -- Check slot availability
    SELECT COUNT(*) INTO v_team_slots_taken FROM match_participants WHERE match_id = p_match_id AND status != 'left';
    IF v_team_slots_taken >= 2 THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_FULL', 'message', 'Match is full');
    END IF;

    -- Determine team side
    v_team_side := CASE WHEN v_team_slots_taken = 0 THEN 'A' ELSE 'B' END;

    -- Check balance
    SELECT balance INTO v_payer_balance FROM wallets WHERE user_id = v_caller_id FOR UPDATE;
    IF COALESCE(v_payer_balance, 0) < v_entry_fee THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'INSUFFICIENT_BALANCE', 'message', 'Insufficient balance');
    END IF;

    -- Deduct and lock
    UPDATE wallets SET balance = balance - v_entry_fee, locked_balance = locked_balance + v_entry_fee WHERE user_id = v_caller_id;

    -- Record transaction with correct type 'lock' (not 'match_entry')
    INSERT INTO transactions (user_id, type, amount, description, match_id)
    VALUES (v_caller_id, 'lock', -v_entry_fee, 'Match entry fee', p_match_id);

    -- Add participant
    INSERT INTO match_participants (match_id, user_id, team_side, status)
    VALUES (p_match_id, v_caller_id, v_team_side, 'joined')
    RETURNING id INTO v_inserted_participant_id;

    -- Update match payer columns
    IF v_team_side = 'A' THEN
      UPDATE matches SET host_payer_user_id = v_caller_id, captain_a_user_id = v_caller_id WHERE id = p_match_id;
    ELSE
      UPDATE matches SET joiner_payer_user_id = v_caller_id, captain_b_user_id = v_caller_id, payment_mode_joiner = 'cover' WHERE id = p_match_id;
    END IF;

    -- Check if match is now full
    SELECT COUNT(*) INTO v_team_slots_taken FROM match_participants WHERE match_id = p_match_id AND status != 'left';
    IF v_team_slots_taken >= 2 THEN
      UPDATE matches SET status = 'ready_check', ready_check_at = now() WHERE id = p_match_id;
    END IF;

    -- Emit player_joined event to notify the match creator
    PERFORM emit_match_event(
      p_match_id,
      'player_joined',
      v_caller_id,
      ARRAY[v_match.creator_id],
      jsonb_build_object('joined_user_id', v_caller_id::text)
    );

    RETURN jsonb_build_object('success', true);
  END IF;

  -- ====== TEAM JOIN ======
  IF p_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'TEAM_REQUIRED', 'message', 'Team ID required for team matches');
  END IF;

  -- Validate payment mode
  IF p_payment_mode NOT IN ('cover', 'split') THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_PAYMENT_MODE', 'message', 'Invalid payment mode');
  END IF;

  -- Fetch team
  SELECT * INTO v_team_record FROM teams WHERE id = p_team_id;
  IF v_team_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'TEAM_NOT_FOUND', 'message', 'Team not found');
  END IF;

  -- Only owner can join
  IF v_team_record.owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'NOT_TEAM_OWNER', 'message', 'Only team owner can join matches');
  END IF;

  -- Get accepted team members
  SELECT array_agg(tm.user_id) INTO v_team_members
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted';

  v_accepted_count := COALESCE(array_length(v_team_members, 1), 0);

  IF v_accepted_count < v_required_size THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'NOT_ENOUGH_MEMBERS', 'message', format('Team needs %s accepted members (has %s)', v_required_size, v_accepted_count));
  END IF;

  -- Take only first N members
  v_team_members := v_team_members[1:v_required_size];

  -- Check no team member is already in a non-terminal match
  FOR v_member_id IN SELECT unnest(v_team_members) LOOP
    SELECT mp.id, m.status
    INTO v_existing_participation
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_member_id
      AND mp.status != 'left'
      AND m.status IN ('open', 'full', 'ready_check', 'in_progress', 'result_pending')
      AND m.expires_at > now()
    LIMIT 1;

    IF v_existing_participation.id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'MEMBER_BUSY', 'message', 'One or more team members are already in an active match');
    END IF;
  END LOOP;

  -- Determine team side
  IF v_match.team_a_id IS NULL THEN
    v_team_side := 'A';
    v_is_host := true;
  ELSIF v_match.team_b_id IS NULL THEN
    v_team_side := 'B';
  ELSE
    RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_FULL', 'message', 'Match is full');
  END IF;

  v_total_cost := v_entry_fee * v_required_size;

  -- ====== PAYMENT PROCESSING ======
  IF p_payment_mode = 'cover' THEN
    SELECT balance INTO v_payer_balance FROM wallets WHERE user_id = v_caller_id FOR UPDATE;
    IF COALESCE(v_payer_balance, 0) < v_total_cost THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'INSUFFICIENT_BALANCE', 'message', format('Insufficient balance (need %s coins)', v_total_cost));
    END IF;

    UPDATE wallets SET balance = balance - v_total_cost, locked_balance = locked_balance + v_total_cost WHERE user_id = v_caller_id;
    
    -- Use correct type 'lock' (not 'match_entry')
    INSERT INTO transactions (user_id, type, amount, description, match_id)
    VALUES (v_caller_id, 'lock', -v_total_cost, 'Team match entry (cover mode)', p_match_id);
  ELSE
    -- Split mode
    FOR v_member_id IN SELECT unnest(v_team_members) LOOP
      SELECT balance INTO v_member_balance FROM wallets WHERE user_id = v_member_id FOR UPDATE;
      IF COALESCE(v_member_balance, 0) < v_entry_fee THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'MEMBER_INSUFFICIENT_BALANCE', 'message', 'One or more team members have insufficient balance');
      END IF;

      UPDATE wallets SET balance = balance - v_entry_fee, locked_balance = locked_balance + v_entry_fee WHERE user_id = v_member_id;
      
      -- Use correct type 'lock' (not 'match_entry')
      INSERT INTO transactions (user_id, type, amount, description, match_id)
      VALUES (v_member_id, 'lock', -v_entry_fee, 'Team match entry (split mode)', p_match_id);
    END LOOP;
  END IF;

  -- Add all participants
  FOREACH v_member_id IN ARRAY v_team_members LOOP
    INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
    VALUES (p_match_id, v_member_id, p_team_id, v_team_side, 'joined');
  END LOOP;

  -- Update match with team assignment
  IF v_team_side = 'A' THEN
    UPDATE matches SET
      team_a_id = p_team_id,
      captain_a_user_id = v_caller_id,
      host_payer_user_id = CASE WHEN p_payment_mode = 'cover' THEN v_caller_id ELSE NULL END,
      payment_mode_host = p_payment_mode
    WHERE id = p_match_id;
  ELSE
    UPDATE matches SET
      team_b_id = p_team_id,
      captain_b_user_id = v_caller_id,
      joiner_payer_user_id = CASE WHEN p_payment_mode = 'cover' THEN v_caller_id ELSE NULL END,
      payment_mode_joiner = p_payment_mode
    WHERE id = p_match_id;
  END IF;

  -- Check if match is now full
  IF v_match.team_a_id IS NOT NULL OR v_team_side = 'B' THEN
    UPDATE matches SET status = 'ready_check', ready_check_at = now() WHERE id = p_match_id;
  END IF;

  -- Emit player_joined event to notify the match creator (for team matches)
  IF NOT v_is_host THEN
    PERFORM emit_match_event(
      p_match_id,
      'player_joined',
      v_caller_id,
      ARRAY[v_match.creator_id],
      jsonb_build_object('joined_user_id', v_caller_id::text, 'team_id', p_team_id::text)
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;