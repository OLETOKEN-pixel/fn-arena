-- ===========================================
-- PHASE 1: Team System Database Updates
-- ===========================================

-- 1.1 Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'team_invite', 'invite_accepted', 'invite_declined', 'match_result', etc.
  title TEXT NOT NULL,
  message TEXT,
  payload JSONB DEFAULT '{}', -- {team_id, team_name, invited_by, match_id, etc.}
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 1.2 Add team columns to matches table
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS team_a_id UUID REFERENCES public.teams(id),
ADD COLUMN IF NOT EXISTS team_b_id UUID REFERENCES public.teams(id),
ADD COLUMN IF NOT EXISTS payment_mode_host TEXT DEFAULT 'cover' CHECK (payment_mode_host IN ('cover', 'split')),
ADD COLUMN IF NOT EXISTS payment_mode_joiner TEXT DEFAULT 'cover' CHECK (payment_mode_joiner IN ('cover', 'split'));

-- ===========================================
-- 1.3 RPC: Search users for team invite
-- ===========================================
CREATE OR REPLACE FUNCTION public.search_users_for_invite(
  p_team_id UUID,
  p_search_term TEXT
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  epic_username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Require at least 2 characters
  IF LENGTH(p_search_term) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.user_id,
    p.username,
    p.epic_username,
    p.avatar_url
  FROM profiles p
  WHERE (
    p.username ILIKE '%' || p_search_term || '%' 
    OR p.epic_username ILIKE '%' || p_search_term || '%'
  )
  -- Exclude users already in team (any status)
  AND NOT EXISTS (
    SELECT 1 FROM team_members tm 
    WHERE tm.team_id = p_team_id 
    AND tm.user_id = p.user_id
  )
  -- Exclude the searcher themselves
  AND p.user_id != auth.uid()
  LIMIT 10;
END;
$$;

-- ===========================================
-- 1.4 RPC: Send team invite
-- ===========================================
CREATE OR REPLACE FUNCTION public.send_team_invite(
  p_team_id UUID,
  p_invitee_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_inviter RECORD;
  v_invitee RECORD;
  v_member_count INT;
  v_existing_member RECORD;
BEGIN
  -- Get team info
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Check if caller is owner or captain
  SELECT * INTO v_inviter 
  FROM team_members 
  WHERE team_id = p_team_id 
  AND user_id = auth.uid() 
  AND status = 'accepted'
  AND role IN ('owner', 'captain');
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to invite members');
  END IF;

  -- Check if invitee exists
  SELECT * INTO v_invitee FROM profiles WHERE user_id = p_invitee_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Check if user is already a member or has pending invite
  SELECT * INTO v_existing_member 
  FROM team_members 
  WHERE team_id = p_team_id AND user_id = p_invitee_user_id;
  
  IF FOUND THEN
    IF v_existing_member.status = 'accepted' THEN
      RETURN json_build_object('success', false, 'error', 'User is already a member of this team');
    ELSIF v_existing_member.status = 'pending' THEN
      RETURN json_build_object('success', false, 'error', 'User already has a pending invite');
    END IF;
  END IF;

  -- Check team size (max 4)
  SELECT COUNT(*) INTO v_member_count 
  FROM team_members 
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_member_count >= 4 THEN
    RETURN json_build_object('success', false, 'error', 'Team is full (max 4 members)');
  END IF;

  -- Create team member record with pending status
  INSERT INTO team_members (team_id, user_id, role, status, invited_by)
  VALUES (p_team_id, p_invitee_user_id, 'member', 'pending', auth.uid());

  -- Create notification for invitee
  INSERT INTO notifications (user_id, type, title, message, payload)
  VALUES (
    p_invitee_user_id,
    'team_invite',
    'Team Invitation',
    'You have been invited to join ' || v_team.name,
    json_build_object(
      'team_id', p_team_id,
      'team_name', v_team.name,
      'team_tag', v_team.tag,
      'invited_by_user_id', auth.uid(),
      'invited_by_username', (SELECT username FROM profiles WHERE user_id = auth.uid())
    )
  );

  RETURN json_build_object('success', true, 'message', 'Invite sent successfully');
END;
$$;

-- ===========================================
-- 1.5 RPC: Respond to team invite
-- ===========================================
CREATE OR REPLACE FUNCTION public.respond_to_invite(
  p_team_id UUID,
  p_action TEXT -- 'accept' or 'decline'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_invite RECORD;
  v_member_count INT;
  v_owner RECORD;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept', 'decline') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;

  -- Get team info
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Get pending invite for this user
  SELECT * INTO v_invite 
  FROM team_members 
  WHERE team_id = p_team_id 
  AND user_id = auth.uid() 
  AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No pending invite found');
  END IF;

  IF p_action = 'accept' THEN
    -- Check team not full
    SELECT COUNT(*) INTO v_member_count 
    FROM team_members 
    WHERE team_id = p_team_id AND status = 'accepted';
    
    IF v_member_count >= 4 THEN
      RETURN json_build_object('success', false, 'error', 'Team is already full');
    END IF;

    -- Accept invite
    UPDATE team_members 
    SET status = 'accepted', updated_at = now()
    WHERE team_id = p_team_id AND user_id = auth.uid();

    -- Notify team owner
    SELECT tm.user_id INTO v_owner
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.role = 'owner';

    INSERT INTO notifications (user_id, type, title, message, payload)
    VALUES (
      v_owner.user_id,
      'invite_accepted',
      'Invite Accepted',
      (SELECT username FROM profiles WHERE user_id = auth.uid()) || ' has joined ' || v_team.name,
      json_build_object(
        'team_id', p_team_id,
        'team_name', v_team.name,
        'accepted_by_user_id', auth.uid(),
        'accepted_by_username', (SELECT username FROM profiles WHERE user_id = auth.uid())
      )
    );

    RETURN json_build_object('success', true, 'message', 'You have joined the team');
  ELSE
    -- Decline invite
    UPDATE team_members 
    SET status = 'rejected', updated_at = now()
    WHERE team_id = p_team_id AND user_id = auth.uid();

    -- Notify team owner
    SELECT tm.user_id INTO v_owner
    FROM team_members tm
    WHERE tm.team_id = p_team_id AND tm.role = 'owner';

    INSERT INTO notifications (user_id, type, title, message, payload)
    VALUES (
      v_owner.user_id,
      'invite_declined',
      'Invite Declined',
      (SELECT username FROM profiles WHERE user_id = auth.uid()) || ' declined to join ' || v_team.name,
      json_build_object(
        'team_id', p_team_id,
        'team_name', v_team.name,
        'declined_by_user_id', auth.uid(),
        'declined_by_username', (SELECT username FROM profiles WHERE user_id = auth.uid())
      )
    );

    RETURN json_build_object('success', true, 'message', 'Invite declined');
  END IF;
END;
$$;

-- ===========================================
-- 1.6 RPC: Get team members with balance info (for payment mode checks)
-- ===========================================
CREATE OR REPLACE FUNCTION public.get_team_members_with_balance(
  p_team_id UUID
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  role TEXT,
  balance NUMERIC,
  has_sufficient_balance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_fee NUMERIC := 0; -- Will be passed or checked separately
BEGIN
  RETURN QUERY
  SELECT 
    tm.user_id,
    p.username,
    p.avatar_url,
    tm.role,
    COALESCE(w.balance, 0) as balance,
    true as has_sufficient_balance -- Default, will be checked in frontend
  FROM team_members tm
  JOIN profiles p ON p.user_id = tm.user_id
  LEFT JOIN wallets w ON w.user_id = tm.user_id
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  ORDER BY 
    CASE tm.role 
      WHEN 'owner' THEN 1 
      WHEN 'captain' THEN 2 
      ELSE 3 
    END;
END;
$$;

-- ===========================================
-- 1.7 RPC: Create team match (with COVER/SPLIT payment)
-- ===========================================
CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id UUID,
  p_entry_fee NUMERIC,
  p_region TEXT,
  p_platform TEXT,
  p_mode TEXT,
  p_team_size INT,
  p_first_to INT,
  p_payment_mode TEXT, -- 'cover' or 'split'
  p_is_private BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_member_count INT;
  v_match_id UUID;
  v_total_cost NUMERIC;
  v_creator_balance NUMERIC;
  v_member RECORD;
  v_insufficient_members TEXT[];
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Validate team size
  IF p_team_size < 2 OR p_team_size > 4 THEN
    RETURN json_build_object('success', false, 'error', 'Team size must be 2, 3, or 4');
  END IF;

  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Check caller is team member
  IF NOT EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_id = p_team_id 
    AND user_id = auth.uid() 
    AND status = 'accepted'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this team');
  END IF;

  -- Check team has EXACT member count
  SELECT COUNT(*) INTO v_member_count 
  FROM team_members 
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_member_count != p_team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Team has ' || v_member_count || ' members but match requires exactly ' || p_team_size);
  END IF;

  v_total_cost := p_entry_fee * p_team_size;
  v_expires_at := now() + interval '15 minutes';

  IF p_payment_mode = 'cover' THEN
    -- COVER mode: creator pays for everyone
    SELECT balance INTO v_creator_balance 
    FROM wallets WHERE user_id = auth.uid();
    
    IF COALESCE(v_creator_balance, 0) < v_total_cost THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance. You need ' || v_total_cost || ' Coins to cover the team');
    END IF;

    -- Create match
    INSERT INTO matches (
      creator_id, entry_fee, region, platform, mode, team_size, first_to, 
      is_private, status, expires_at, team_a_id, payment_mode_host
    ) VALUES (
      auth.uid(), p_entry_fee, p_region, p_platform, p_mode, p_team_size, p_first_to,
      p_is_private, 'open', v_expires_at, p_team_id, 'cover'
    ) RETURNING id INTO v_match_id;

    -- Lock funds from creator
    UPDATE wallets 
    SET balance = balance - v_total_cost, 
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    -- Create transaction record
    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (auth.uid(), 'lock', v_total_cost, 'Entry fee locked (covering team)', v_match_id, 'completed');

  ELSE
    -- SPLIT mode: each member pays their share
    v_insufficient_members := ARRAY[]::TEXT[];
    
    FOR v_member IN 
      SELECT tm.user_id, p.username, COALESCE(w.balance, 0) as balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      LEFT JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      IF v_member.balance < p_entry_fee THEN
        v_insufficient_members := array_append(v_insufficient_members, v_member.username);
      END IF;
    END LOOP;

    IF array_length(v_insufficient_members, 1) > 0 THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance for: ' || array_to_string(v_insufficient_members, ', '),
        'insufficient_members', v_insufficient_members);
    END IF;

    -- Create match
    INSERT INTO matches (
      creator_id, entry_fee, region, platform, mode, team_size, first_to, 
      is_private, status, expires_at, team_a_id, payment_mode_host
    ) VALUES (
      auth.uid(), p_entry_fee, p_region, p_platform, p_mode, p_team_size, p_first_to,
      p_is_private, 'open', v_expires_at, p_team_id, 'split'
    ) RETURNING id INTO v_match_id;

    -- Lock funds from each member
    FOR v_member IN 
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      UPDATE wallets 
      SET balance = balance - p_entry_fee, 
          locked_balance = locked_balance + p_entry_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', p_entry_fee, 'Entry fee locked (split)', v_match_id, 'completed');
    END LOOP;
  END IF;

  -- Create participant records for all team members
  INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
  SELECT v_match_id, tm.user_id, p_team_id, 'A', 'joined'
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted';

  RETURN json_build_object('success', true, 'match_id', v_match_id);
END;
$$;

-- ===========================================
-- 1.8 RPC: Join team match (with COVER/SPLIT payment)
-- ===========================================
CREATE OR REPLACE FUNCTION public.join_team_match(
  p_match_id UUID,
  p_team_id UUID,
  p_payment_mode TEXT -- 'cover' or 'split'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_team RECORD;
  v_member_count INT;
  v_total_cost NUMERIC;
  v_joiner_balance NUMERIC;
  v_member RECORD;
  v_insufficient_members TEXT[];
BEGIN
  -- Get match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Check match is open
  IF v_match.status != 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
  END IF;

  -- Check match hasn't expired
  IF v_match.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Match has expired');
  END IF;

  -- Check it's a team match
  IF v_match.team_size < 2 THEN
    RETURN json_build_object('success', false, 'error', 'This is not a team match');
  END IF;

  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Check not joining with same team
  IF v_match.team_a_id = p_team_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot join with the same team');
  END IF;

  -- Check caller is team member
  IF NOT EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_id = p_team_id 
    AND user_id = auth.uid() 
    AND status = 'accepted'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this team');
  END IF;

  -- Check team has EXACT member count
  SELECT COUNT(*) INTO v_member_count 
  FROM team_members 
  WHERE team_id = p_team_id AND status = 'accepted';
  
  IF v_member_count != v_match.team_size THEN
    RETURN json_build_object('success', false, 'error', 
      'Team has ' || v_member_count || ' members but match requires exactly ' || v_match.team_size);
  END IF;

  v_total_cost := v_match.entry_fee * v_match.team_size;

  IF p_payment_mode = 'cover' THEN
    -- COVER mode: joiner (captain) pays for everyone
    SELECT balance INTO v_joiner_balance 
    FROM wallets WHERE user_id = auth.uid();
    
    IF COALESCE(v_joiner_balance, 0) < v_total_cost THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance. You need ' || v_total_cost || ' Coins to cover the team');
    END IF;

    -- Lock funds from joiner
    UPDATE wallets 
    SET balance = balance - v_total_cost, 
        locked_balance = locked_balance + v_total_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (auth.uid(), 'lock', v_total_cost, 'Entry fee locked (covering team)', p_match_id, 'completed');

  ELSE
    -- SPLIT mode: each member pays their share
    v_insufficient_members := ARRAY[]::TEXT[];
    
    FOR v_member IN 
      SELECT tm.user_id, p.username, COALESCE(w.balance, 0) as balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      LEFT JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      IF v_member.balance < v_match.entry_fee THEN
        v_insufficient_members := array_append(v_insufficient_members, v_member.username);
      END IF;
    END LOOP;

    IF array_length(v_insufficient_members, 1) > 0 THEN
      RETURN json_build_object('success', false, 'error', 
        'Insufficient balance for: ' || array_to_string(v_insufficient_members, ', '),
        'insufficient_members', v_insufficient_members);
    END IF;

    -- Lock funds from each member
    FOR v_member IN 
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
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

  -- Update match with team B and payment mode
  UPDATE matches 
  SET team_b_id = p_team_id, 
      payment_mode_joiner = p_payment_mode,
      status = 'ready_check'
  WHERE id = p_match_id;

  -- Create participant records for all team B members
  INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
  SELECT p_match_id, tm.user_id, p_team_id, 'B', 'joined'
  FROM team_members tm
  WHERE tm.team_id = p_team_id AND tm.status = 'accepted';

  RETURN json_build_object('success', true, 'message', 'Team joined successfully');
END;
$$;

-- ===========================================
-- 1.9 RPC: Remove team member (owner only)
-- ===========================================
CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_team_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_member RECORD;
BEGIN
  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Check caller is owner
  IF v_team.owner_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only the team owner can remove members');
  END IF;

  -- Cannot remove owner
  IF p_user_id = v_team.owner_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot remove the team owner');
  END IF;

  -- Check member exists
  SELECT * INTO v_member 
  FROM team_members 
  WHERE team_id = p_team_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User is not a member of this team');
  END IF;

  -- Remove member
  DELETE FROM team_members 
  WHERE team_id = p_team_id AND user_id = p_user_id;

  -- Notify removed member
  INSERT INTO notifications (user_id, type, title, message, payload)
  VALUES (
    p_user_id,
    'removed_from_team',
    'Removed from Team',
    'You have been removed from ' || v_team.name,
    json_build_object('team_id', p_team_id, 'team_name', v_team.name)
  );

  RETURN json_build_object('success', true, 'message', 'Member removed');
END;
$$;

-- ===========================================
-- 1.10 RPC: Leave team (member action)
-- ===========================================
CREATE OR REPLACE FUNCTION public.leave_team(
  p_team_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_member RECORD;
BEGIN
  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Owner cannot leave (must delete team instead)
  IF v_team.owner_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Team owner cannot leave. Transfer ownership or delete the team.');
  END IF;

  -- Check is member
  SELECT * INTO v_member 
  FROM team_members 
  WHERE team_id = p_team_id AND user_id = auth.uid() AND status = 'accepted';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this team');
  END IF;

  -- Leave team
  DELETE FROM team_members 
  WHERE team_id = p_team_id AND user_id = auth.uid();

  -- Notify owner
  INSERT INTO notifications (user_id, type, title, message, payload)
  VALUES (
    v_team.owner_id,
    'member_left',
    'Member Left Team',
    (SELECT username FROM profiles WHERE user_id = auth.uid()) || ' has left ' || v_team.name,
    json_build_object(
      'team_id', p_team_id, 
      'team_name', v_team.name,
      'left_by_user_id', auth.uid()
    )
  );

  RETURN json_build_object('success', true, 'message', 'You have left the team');
END;
$$;