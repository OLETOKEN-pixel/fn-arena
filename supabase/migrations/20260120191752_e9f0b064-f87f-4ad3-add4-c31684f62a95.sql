-- Need to DROP to change return type (existing finalize_team_match returns json)
DROP FUNCTION IF EXISTS public.finalize_team_match(uuid,text);

-- Recreate with correct columns (no winner_team_side / completed_at)
CREATE FUNCTION public.finalize_team_match(p_match_id uuid, p_winner_side text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_entry_fee numeric;
  v_team_size int;
  v_total_pot numeric;
  v_platform_fee numeric;
  v_winner_team_id uuid;
  v_loser_team_id uuid;
  v_winner_payer_id uuid;
  v_loser_payer_id uuid;
  v_required_locked numeric;
  v_winner_locked numeric;
  v_loser_locked numeric;
  v_winner_payment_mode text;
  v_loser_payment_mode text;
BEGIN
  IF p_winner_side NOT IN ('A','B') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid winner side');
  END IF;

  SELECT * INTO v_match
  FROM matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.team_size IS NULL OR v_match.team_size <= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a team match');
  END IF;

  IF v_match.status NOT IN ('result_pending','in_progress') THEN
    IF v_match.status IN ('finished','disputed') THEN
      RETURN jsonb_build_object('success', true, 'status', v_match.status, 'message', 'Already finalized');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Match not in valid state');
  END IF;

  v_entry_fee := COALESCE(v_match.entry_fee, 0);
  v_team_size := COALESCE(v_match.team_size, 0);
  v_total_pot := v_entry_fee * v_team_size * 2;

  IF p_winner_side = 'A' THEN
    v_winner_team_id := v_match.team_a_id;
    v_loser_team_id := v_match.team_b_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
    v_winner_payer_id := COALESCE(v_match.host_payer_user_id, v_match.creator_id);
    v_loser_payer_id := v_match.joiner_payer_user_id;
  ELSE
    v_winner_team_id := v_match.team_b_id;
    v_loser_team_id := v_match.team_a_id;
    v_winner_payment_mode := COALESCE(v_match.payment_mode_joiner, 'cover');
    v_loser_payment_mode := COALESCE(v_match.payment_mode_host, 'cover');
    v_winner_payer_id := v_match.joiner_payer_user_id;
    v_loser_payer_id := COALESCE(v_match.host_payer_user_id, v_match.creator_id);
  END IF;

  IF v_winner_team_id IS NULL OR v_loser_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teams not set');
  END IF;

  -- Fee: 5% of total pot
  v_platform_fee := round(v_total_pot * 0.05);

  -- Validate locked funds for cover mode
  v_required_locked := v_entry_fee * v_team_size;

  IF v_winner_payment_mode = 'cover' THEN
    SELECT locked_balance INTO v_winner_locked FROM wallets WHERE user_id = v_winner_payer_id;
    IF COALESCE(v_winner_locked, 0) < v_required_locked THEN
      RETURN jsonb_build_object('success', false, 'error', 'Locked balance mismatch (winner payer)');
    END IF;
  END IF;

  IF v_loser_payment_mode = 'cover' THEN
    SELECT locked_balance INTO v_loser_locked FROM wallets WHERE user_id = v_loser_payer_id;
    IF COALESCE(v_loser_locked, 0) < v_required_locked THEN
      RETURN jsonb_build_object('success', false, 'error', 'Locked balance mismatch (loser payer)');
    END IF;
  END IF;

  -- WINNER: unlock + payout
  IF v_winner_payment_mode = 'cover' THEN
    UPDATE wallets
    SET locked_balance = locked_balance - v_required_locked,
        balance = balance + (v_total_pot - v_platform_fee),
        updated_at = now()
    WHERE user_id = v_winner_payer_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_winner_payer_id, 'payout', (v_total_pot - v_platform_fee), 'Match payout (cover)', p_match_id, 'completed');
  ELSE
    -- split: each member unlocks + receives (2*entry_fee - fee/team_size)
    WITH winner_members AS (
      SELECT user_id
      FROM match_participants
      WHERE match_id = p_match_id AND team_side = p_winner_side
      ORDER BY joined_at ASC
      LIMIT v_team_size
    ), fee_each AS (
      SELECT (v_platform_fee / NULLIF(v_team_size,0))::numeric AS v
    )
    UPDATE wallets w
    SET locked_balance = w.locked_balance - v_entry_fee,
        balance = w.balance + (v_entry_fee * 2) - (SELECT v FROM fee_each),
        updated_at = now()
    FROM winner_members m
    WHERE w.user_id = m.user_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    SELECT m.user_id, 'payout', (v_entry_fee * 2) - (v_platform_fee / NULLIF(v_team_size,0)), 'Match payout (split)', p_match_id, 'completed'
    FROM (
      SELECT user_id
      FROM match_participants
      WHERE match_id = p_match_id AND team_side = p_winner_side
      ORDER BY joined_at ASC
      LIMIT v_team_size
    ) m;
  END IF;

  -- LOSER: unlock only
  IF v_loser_payment_mode = 'cover' THEN
    UPDATE wallets
    SET locked_balance = locked_balance - v_required_locked,
        updated_at = now()
    WHERE user_id = v_loser_payer_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_loser_payer_id, 'fee', v_required_locked, 'Match loss (cover)', p_match_id, 'completed');
  ELSE
    WITH loser_members AS (
      SELECT user_id
      FROM match_participants
      WHERE match_id = p_match_id AND team_side <> p_winner_side
      ORDER BY joined_at ASC
      LIMIT v_team_size
    )
    UPDATE wallets w
    SET locked_balance = w.locked_balance - v_entry_fee,
        updated_at = now()
    FROM loser_members m
    WHERE w.user_id = m.user_id;

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    SELECT m.user_id, 'fee', v_entry_fee, 'Match loss (split)', p_match_id, 'completed'
    FROM (
      SELECT user_id
      FROM match_participants
      WHERE match_id = p_match_id AND team_side <> p_winner_side
      ORDER BY joined_at ASC
      LIMIT v_team_size
    ) m;
  END IF;

  PERFORM public.record_platform_fee(v_platform_fee, p_match_id);

  UPDATE matches
  SET status = 'finished',
      finished_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO match_results (match_id, winner_team_id, status, created_at, updated_at)
  VALUES (p_match_id, v_winner_team_id, 'confirmed', now(), now())
  ON CONFLICT (match_id) DO UPDATE
  SET winner_team_id = EXCLUDED.winner_team_id,
      status = 'confirmed',
      updated_at = now();

  RETURN jsonb_build_object('success', true, 'status', 'finished', 'winner_side', p_winner_side);
END;
$$;

-- Ensure join_team_match uses the correct status value expected by the app
CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id uuid,
  p_team_id uuid,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_team record;
  v_team_member_count integer;
  v_member record;
  v_joiner_balance numeric;
  v_member_balance numeric;
  v_total_cost numeric;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;
  IF v_match.team_size <= 1 THEN
    RETURN json_build_object('success', false, 'error', 'This is not a team match');
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;
  IF v_team.owner_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only team owner can join matches');
  END IF;
  IF v_match.team_a_id = p_team_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot join with the same team');
  END IF;

  SELECT count(*) INTO v_team_member_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  IF v_team_member_count < v_match.team_size THEN
    RETURN json_build_object('success', false, 'error',
      'Not enough accepted members. Need ' || v_match.team_size || ', have ' || v_team_member_count);
  END IF;

  v_total_cost := v_match.entry_fee * v_match.team_size;

  IF p_payment_mode = 'cover' THEN
    SELECT balance INTO v_joiner_balance FROM wallets WHERE user_id = auth.uid();
    IF COALESCE(v_joiner_balance, 0) < v_total_cost THEN
      RETURN json_build_object('success', false, 'error',
        'Insufficient balance. You need ' || v_total_cost || ' Coins to cover the team');
    END IF;

    UPDATE wallets
    SET balance = balance - v_total_cost,
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (auth.uid(), 'lock', v_total_cost, 'Entry fee locked (covering team)', p_match_id, 'completed');
  ELSE
    FOR v_member IN
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT v_match.team_size
    LOOP
      SELECT balance INTO v_member_balance FROM wallets WHERE user_id = v_member.user_id;
      IF COALESCE(v_member_balance, 0) < v_match.entry_fee THEN
        RETURN json_build_object('success', false, 'error',
          'Team member has insufficient balance for split payment');
      END IF;
    END LOOP;

    FOR v_member IN
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
      ORDER BY tm.joined_at ASC
      LIMIT v_match.team_size
    LOOP
      UPDATE wallets
      SET balance = balance - v_match.entry_fee,
          locked_balance = locked_balance + v_match.entry_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', v_match.entry_fee, 'Entry fee locked (split)', p_match_id, 'completed');
    END LOOP;
  END IF;

  UPDATE matches
  SET team_b_id = p_team_id,
      payment_mode_joiner = p_payment_mode,
      joiner_payer_user_id = auth.uid(),
      status = 'ready_check',
      updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO match_participants (match_id, user_id, team_side, team_id, joined_at)
  SELECT p_match_id, tm.user_id, 'B', p_team_id, now()
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  ORDER BY tm.joined_at ASC
  LIMIT v_match.team_size;

  RETURN json_build_object('success', true, 'match_id', p_match_id, 'status', 'joined');
END;
$$;