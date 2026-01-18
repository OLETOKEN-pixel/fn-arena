-- Fix join_team_match to correctly handle JSONB return from team_has_active_match
CREATE OR REPLACE FUNCTION public.join_team_match(
    p_match_id UUID,
    p_team_id UUID,
    p_payment_mode TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_match RECORD;
    v_team RECORD;
    v_team_member RECORD;
    v_member RECORD;
    v_entry_fee NUMERIC;
    v_total_fee NUMERIC;
    v_wallet RECORD;
    v_accepted_count INT;
    v_active_check JSONB;  -- Store JSONB result from team_has_active_match
BEGIN
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check if team already has an active match (FIXED: properly handle JSONB)
    v_active_check := public.team_has_active_match(p_team_id);
    IF (v_active_check->>'has_active')::boolean THEN
        RETURN json_build_object('success', false, 'error', 
            (v_active_check->>'username') || ' already has an active match. Complete or cancel it first.');
    END IF;

    -- Lock and fetch match
    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- Check if match is expired
    IF v_match.expires_at < now() THEN
        PERFORM public.expire_stale_matches();
        RETURN json_build_object('success', false, 'error', 'This match has expired');
    END IF;

    IF v_match.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
    END IF;

    -- Verify team ownership
    SELECT * INTO v_team FROM teams WHERE id = p_team_id;
    
    IF v_team IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Team not found');
    END IF;

    IF v_team.owner_id != v_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Only team owner can join matches');
    END IF;

    -- Check if it's the same team as Team A
    IF v_match.team_a_id = p_team_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot join your own match');
    END IF;

    -- Verify team size matches
    SELECT COUNT(*) INTO v_accepted_count
    FROM team_members
    WHERE team_id = p_team_id AND status = 'accepted';
    
    IF v_accepted_count != v_match.team_size THEN
        RETURN json_build_object('success', false, 'error', 
            'Team must have exactly ' || v_match.team_size || ' accepted members. You have ' || v_accepted_count);
    END IF;

    v_entry_fee := v_match.entry_fee;

    IF p_payment_mode = 'cover' THEN
        -- Owner covers all
        v_total_fee := v_entry_fee * v_match.team_size;
        
        SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
        
        IF v_wallet IS NULL OR v_wallet.balance < v_total_fee THEN
            RETURN json_build_object('success', false, 'error', 'Insufficient balance to cover team');
        END IF;

        UPDATE wallets 
        SET balance = balance - v_total_fee,
            locked_balance = locked_balance + v_total_fee,
            updated_at = now()
        WHERE user_id = v_user_id AND id IS NOT NULL;

        INSERT INTO transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_user_id, 'lock', v_total_fee, p_match_id, 'Team entry fee locked (covered)', 'completed');

    ELSIF p_payment_mode = 'split' THEN
        -- Each member pays
        FOR v_member IN 
            SELECT tm.user_id 
            FROM team_members tm 
            WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
        LOOP
            SELECT * INTO v_wallet FROM wallets WHERE user_id = v_member.user_id FOR UPDATE;
            
            IF v_wallet IS NULL OR v_wallet.balance < v_entry_fee THEN
                RAISE EXCEPTION 'Team member has insufficient balance';
            END IF;

            UPDATE wallets 
            SET balance = balance - v_entry_fee,
                locked_balance = locked_balance + v_entry_fee,
                updated_at = now()
            WHERE user_id = v_member.user_id AND id IS NOT NULL;

            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_member.user_id, 'lock', v_entry_fee, p_match_id, 'Entry fee locked (split)', 'completed');
        END LOOP;
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid payment mode');
    END IF;

    -- Update match with Team B
    UPDATE matches 
    SET team_b_id = p_team_id,
        status = 'full',
        payment_mode_joiner = p_payment_mode
    WHERE id = p_match_id;

    -- Add all team members as participants
    FOR v_team_member IN
        SELECT tm.user_id
        FROM team_members tm
        WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
        INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
        VALUES (p_match_id, v_team_member.user_id, p_team_id, 'B', 'joined');
    END LOOP;

    -- Notify Team A members
    FOR v_member IN
        SELECT tm.user_id
        FROM team_members tm
        WHERE tm.team_id = v_match.team_a_id AND tm.status = 'accepted'
    LOOP
        INSERT INTO notifications (user_id, type, title, message, payload)
        VALUES (v_member.user_id, 'match_joined', 'Opponent Found!',
            'A team has joined your match. Get ready!',
            jsonb_build_object('match_id', p_match_id));
    END LOOP;

    RETURN json_build_object('success', true, 'match_id', p_match_id);
END;
$$;