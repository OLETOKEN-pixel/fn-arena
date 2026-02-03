-- Fix join_match_v2: Use 'ready_check' instead of 'full' status
-- This ensures matches are immediately ready for the ready-up phase after joining

CREATE OR REPLACE FUNCTION public.join_match_v2(
  p_match_id uuid,
  p_team_id uuid DEFAULT NULL,
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
  v_entry_fee numeric;
  v_wallet wallets%ROWTYPE;
  v_team_side text;
  v_participant_count int;
  v_expected_count int;
  v_total_cost numeric;
  v_member_ids uuid[];
  v_member_id uuid;
  v_member_wallet wallets%ROWTYPE;
  v_joined_count int;
  v_opponent_ids uuid[];
BEGIN
  -- Authentication check
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is banned
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = v_caller_id AND is_banned = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account banned');
  END IF;

  -- Lock match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Must be open
  IF v_match.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;

  -- Check expiry
  IF v_match.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match has expired');
  END IF;

  v_entry_fee := v_match.entry_fee;

  -- ==================== 1v1 MODE ====================
  IF v_match.team_size = 1 THEN
    -- Cannot join own match
    IF v_match.creator_id = v_caller_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own match');
    END IF;

    -- Check not already participant
    IF EXISTS (SELECT 1 FROM match_participants WHERE match_id = p_match_id AND user_id = v_caller_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Already in this match');
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet FROM wallets WHERE user_id = v_caller_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO wallets (user_id, balance, locked_balance) VALUES (v_caller_id, 0, 0)
      RETURNING * INTO v_wallet;
    END IF;

    -- Check balance
    IF v_wallet.balance < v_entry_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'required', v_entry_fee, 'available', v_wallet.balance);
    END IF;

    -- Deduct and lock
    UPDATE wallets SET 
      balance = balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee,
      updated_at = now()
    WHERE user_id = v_caller_id;

    -- Record transaction with POSITIVE amount (critical fix!)
    INSERT INTO transactions (user_id, type, amount, description, match_id)
    VALUES (v_caller_id, 'lock', v_entry_fee, 'Match entry fee', p_match_id);

    -- Add participant as team B
    INSERT INTO match_participants (match_id, user_id, team_side, status)
    VALUES (p_match_id, v_caller_id, 'B', 'joined');

    -- Update match status to ready_check (FIX: was 'full')
    UPDATE matches SET 
      status = 'ready_check',
      ready_check_at = now()
    WHERE id = p_match_id;

    -- Emit event to creator (opponent)
    PERFORM emit_match_event(
      p_match_id,
      'player_joined',
      v_caller_id,
      ARRAY[v_match.creator_id],
      jsonb_build_object('joined_user_id', v_caller_id, 'joined_count', 2, 'max_players', 2, 'team_side', 'B')
    );

    RETURN jsonb_build_object('success', true, 'status', 'joined', 'match_status', 'ready_check');

  -- ==================== TEAM MODE ====================
  ELSE
    -- Must provide team_id
    IF p_team_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Team ID required for team matches');
    END IF;

    -- Verify team exists and caller is owner/captain
    IF NOT EXISTS (
      SELECT 1 FROM teams WHERE id = p_team_id AND owner_id = v_caller_id
    ) AND NOT EXISTS (
      SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = v_caller_id AND role = 'captain' AND status = 'accepted'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Must be team owner or captain to join matches');
    END IF;

    -- Check if team already in match
    IF v_match.team_a_id = p_team_id OR v_match.team_b_id = p_team_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Team already in this match');
    END IF;

    -- team_a_id should be set by creator, we're joining as team_b
    IF v_match.team_a_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Match not properly initialized');
    END IF;

    IF v_match.team_b_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Match already has opponent team');
    END IF;

    v_team_side := 'B';

    -- Get active team members (owner + accepted members) up to team_size
    SELECT array_agg(uid) INTO v_member_ids FROM (
      SELECT owner_id as uid FROM teams WHERE id = p_team_id
      UNION
      SELECT user_id as uid FROM team_members 
      WHERE team_id = p_team_id AND status = 'accepted'
      LIMIT (v_match.team_size - 1)
    ) sub
    LIMIT v_match.team_size;

    IF array_length(v_member_ids, 1) IS NULL OR array_length(v_member_ids, 1) < v_match.team_size THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not enough team members', 'required', v_match.team_size, 'have', COALESCE(array_length(v_member_ids, 1), 0));
    END IF;

    -- Validate payment mode
    IF p_payment_mode NOT IN ('cover', 'split') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode');
    END IF;

    v_total_cost := v_entry_fee * v_match.team_size;

    -- COVER MODE: captain pays for everyone
    IF p_payment_mode = 'cover' THEN
      SELECT * INTO v_wallet FROM wallets WHERE user_id = v_caller_id FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO wallets (user_id, balance, locked_balance) VALUES (v_caller_id, 0, 0)
        RETURNING * INTO v_wallet;
      END IF;

      IF v_wallet.balance < v_total_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance for team entry', 'required', v_total_cost, 'available', v_wallet.balance);
      END IF;

      UPDATE wallets SET 
        balance = balance - v_total_cost,
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
      WHERE user_id = v_caller_id;

      -- Record transaction with POSITIVE amount (critical fix!)
      INSERT INTO transactions (user_id, type, amount, description, match_id)
      VALUES (v_caller_id, 'lock', v_total_cost, 'Team match entry (cover mode)', p_match_id);

    -- SPLIT MODE: each member pays their share
    ELSE
      FOREACH v_member_id IN ARRAY v_member_ids LOOP
        SELECT * INTO v_member_wallet FROM wallets WHERE user_id = v_member_id FOR UPDATE;
        IF NOT FOUND THEN
          INSERT INTO wallets (user_id, balance, locked_balance) VALUES (v_member_id, 0, 0)
          RETURNING * INTO v_member_wallet;
        END IF;

        IF v_member_wallet.balance < v_entry_fee THEN
          RETURN jsonb_build_object('success', false, 'error', 'Team member has insufficient balance', 'member_id', v_member_id);
        END IF;

        UPDATE wallets SET 
          balance = balance - v_entry_fee,
          locked_balance = locked_balance + v_entry_fee,
          updated_at = now()
        WHERE user_id = v_member_id;

        -- Record transaction with POSITIVE amount (critical fix!)
        INSERT INTO transactions (user_id, type, amount, description, match_id)
        VALUES (v_member_id, 'lock', v_entry_fee, 'Team match entry (split mode)', p_match_id);
      END LOOP;
    END IF;

    -- Add all team members as participants
    FOREACH v_member_id IN ARRAY v_member_ids LOOP
      INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
      VALUES (p_match_id, v_member_id, p_team_id, v_team_side, 'joined')
      ON CONFLICT (match_id, user_id) DO NOTHING;
    END LOOP;

    -- Update match to ready_check (FIX: was 'full')
    UPDATE matches SET 
      team_b_id = p_team_id,
      captain_b_user_id = v_caller_id,
      joiner_payer_user_id = v_caller_id,
      payment_mode_joiner = p_payment_mode,
      status = 'ready_check',
      ready_check_at = now()
    WHERE id = p_match_id;

    -- Get opponent team member IDs for event targeting
    SELECT array_agg(user_id) INTO v_opponent_ids
    FROM match_participants
    WHERE match_id = p_match_id AND team_side = 'A';

    -- Count joined players
    SELECT COUNT(*) INTO v_joined_count FROM match_participants WHERE match_id = p_match_id;

    -- Emit event to ALL opponent team members (not just creator)
    IF v_opponent_ids IS NOT NULL AND array_length(v_opponent_ids, 1) > 0 THEN
      PERFORM emit_match_event(
        p_match_id,
        'player_joined',
        v_caller_id,
        v_opponent_ids,
        jsonb_build_object(
          'joined_team_id', p_team_id, 
          'joined_count', v_joined_count, 
          'max_players', v_match.team_size * 2,
          'team_side', v_team_side
        )
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'joined', 'match_status', 'ready_check', 'team_side', v_team_side);
  END IF;
END;
$$;

-- Data repair: Unblock existing matches stuck in 'full' status
UPDATE matches
SET status = 'ready_check'
WHERE status = 'full'
  AND started_at IS NULL
  AND expires_at > now();