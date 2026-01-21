-- =============================================================================
-- FIX CRITICO: Eliminare ambiguità create_team_match
-- =============================================================================

-- Drop ALL possible overloaded versions of create_team_match
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer, integer, boolean, text);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, boolean, text);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, numeric, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.create_team_match(uuid, integer, text, text, text, integer, integer);

-- Ricrea UNA SOLA versione canonica con firma chiara
CREATE OR REPLACE FUNCTION public.create_team_match(
  p_team_id UUID,
  p_entry_fee NUMERIC,
  p_region TEXT,
  p_platform TEXT,
  p_mode TEXT,
  p_team_size INTEGER,
  p_first_to INTEGER DEFAULT 3,
  p_payment_mode TEXT DEFAULT 'cover',
  p_is_private BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_team RECORD;
  v_member RECORD;
  v_match_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_total_entry NUMERIC;
  v_per_member_fee NUMERIC;
  v_payer_wallet RECORD;
  v_private_code TEXT;
  v_accepted_count INTEGER;
BEGIN
  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate team exists and user is owner
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_team.owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only team owner can create matches');
  END IF;

  -- Count accepted members (including owner)
  SELECT COUNT(*) INTO v_accepted_count
  FROM team_members
  WHERE team_id = p_team_id AND status = 'accepted';

  -- Validate team has enough members for the match size
  IF v_accepted_count < p_team_size THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Team needs %s accepted members for %sv%s match (has %s)', 
                      p_team_size, p_team_size, p_team_size, v_accepted_count)
    );
  END IF;

  -- Check if any team member has an active match
  FOR v_member IN 
    SELECT tm.user_id, p.username
    FROM team_members tm
    JOIN profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
  LOOP
    IF public.has_active_match(v_member.user_id) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Team member %s already has an active match', v_member.username)
      );
    END IF;
  END LOOP;

  -- Calculate fees
  v_total_entry := p_entry_fee * p_team_size;
  v_per_member_fee := p_entry_fee;

  -- Validate wallet balance based on payment mode
  IF p_payment_mode = 'cover' THEN
    -- Owner pays for entire team
    SELECT * INTO v_payer_wallet FROM wallets WHERE user_id = v_user_id;
    IF v_payer_wallet IS NULL OR v_payer_wallet.balance < v_total_entry THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Insufficient balance. Need %s coins to cover team', v_total_entry)
      );
    END IF;
  ELSE
    -- Split: each member pays their share
    FOR v_member IN 
      SELECT tm.user_id, p.username, w.balance
      FROM team_members tm
      JOIN profiles p ON p.user_id = tm.user_id
      LEFT JOIN wallets w ON w.user_id = tm.user_id
      WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
      IF v_member.balance IS NULL OR v_member.balance < v_per_member_fee THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Team member %s has insufficient balance', v_member.username)
        );
      END IF;
    END LOOP;
  END IF;

  -- Generate private code if needed
  IF p_is_private THEN
    v_private_code := upper(substr(md5(random()::text), 1, 6));
  END IF;

  -- Set expiration (24 hours)
  v_expires_at := now() + interval '24 hours';

  -- Create the match
  INSERT INTO matches (
    creator_id,
    game,
    region,
    platform,
    mode,
    team_size,
    first_to,
    entry_fee,
    is_private,
    private_code,
    expires_at,
    status,
    team_a_id,
    host_payer_user_id,
    payment_mode_host
  ) VALUES (
    v_user_id,
    'FN',
    p_region,
    p_platform,
    p_mode,
    p_team_size,
    p_first_to,
    p_entry_fee,
    p_is_private,
    v_private_code,
    v_expires_at,
    'open',
    p_team_id,
    v_user_id,
    p_payment_mode
  )
  RETURNING id INTO v_match_id;

  -- Lock funds based on payment mode
  IF p_payment_mode = 'cover' THEN
    -- Owner pays for entire team
    UPDATE wallets 
    SET balance = balance - v_total_entry,
        locked_balance = locked_balance + v_total_entry,
        updated_at = now()
    WHERE user_id = v_user_id;

    -- Record single lock transaction
    INSERT INTO transactions (user_id, type, amount, description, match_id, status)
    VALUES (v_user_id, 'lock', -v_total_entry, 
            format('Locked for team match (cover %s members)', p_team_size), 
            v_match_id, 'completed');
  ELSE
    -- Split: lock funds from each member
    FOR v_member IN 
      SELECT user_id FROM team_members 
      WHERE team_id = p_team_id AND status = 'accepted'
    LOOP
      UPDATE wallets 
      SET balance = balance - v_per_member_fee,
          locked_balance = locked_balance + v_per_member_fee,
          updated_at = now()
      WHERE user_id = v_member.user_id;

      INSERT INTO transactions (user_id, type, amount, description, match_id, status)
      VALUES (v_member.user_id, 'lock', -v_per_member_fee, 
              'Locked for team match (split)', v_match_id, 'completed');
    END LOOP;
  END IF;

  -- Add all team members as participants
  FOR v_member IN 
    SELECT user_id FROM team_members 
    WHERE team_id = p_team_id AND status = 'accepted'
  LOOP
    INSERT INTO match_participants (match_id, user_id, team_side, team_id, status)
    VALUES (v_match_id, v_member.user_id, 'A', p_team_id, 'joined');
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 
    'match_id', v_match_id,
    'private_code', v_private_code
  );
END;
$$;