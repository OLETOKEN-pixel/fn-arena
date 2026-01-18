-- Fix join_team_match to set status to 'ready_check' instead of 'full'
-- This ensures team matches appear in My Matches immediately after both teams join

CREATE OR REPLACE FUNCTION public.join_team_match(
    p_match_id UUID,
    p_team_id UUID,
    p_payment_mode TEXT DEFAULT 'split'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match RECORD;
    v_team RECORD;
    v_member RECORD;
    v_active_check JSONB;
    v_total_cost NUMERIC;
    v_payer_id UUID;
    v_payer_balance NUMERIC;
    v_member_balance NUMERIC;
    v_accepted_count INT;
BEGIN
    -- Validate payment mode
    IF p_payment_mode NOT IN ('split', 'cover') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid payment mode');
    END IF;

    -- Get match with lock
    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
    END IF;
    
    IF v_match.expires_at < now() THEN
        RETURN json_build_object('success', false, 'error', 'Match has expired');
    END IF;

    -- Get team
    SELECT * INTO v_team FROM teams WHERE id = p_team_id;
    
    IF v_team IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Team not found');
    END IF;
    
    -- Verify caller is team owner
    IF v_team.owner_id != auth.uid() THEN
        RETURN json_build_object('success', false, 'error', 'Only team owner can join matches');
    END IF;

    -- Count accepted members
    SELECT COUNT(*) INTO v_accepted_count
    FROM team_members
    WHERE team_id = p_team_id AND status = 'accepted';
    
    IF v_accepted_count != v_match.team_size THEN
        RETURN json_build_object('success', false, 'error', 
            'Team must have exactly ' || v_match.team_size || ' members (has ' || v_accepted_count || ')');
    END IF;

    -- Cannot join own match
    IF v_match.team_a_id = p_team_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot join your own match');
    END IF;

    -- Check if any team member has an active match
    v_active_check := team_has_active_match(p_team_id);
    IF (v_active_check->>'has_active')::boolean THEN
        RETURN json_build_object('success', false, 'error', 
            'Team member ' || (v_active_check->>'username') || ' is already in an active match');
    END IF;

    -- Calculate total cost
    v_total_cost := v_match.entry_fee * v_match.team_size;

    -- Handle payment based on mode
    IF p_payment_mode = 'cover' THEN
        -- Owner covers all
        v_payer_id := auth.uid();
        
        SELECT balance INTO v_payer_balance FROM wallets WHERE user_id = v_payer_id FOR UPDATE;
        
        IF v_payer_balance IS NULL OR v_payer_balance < v_total_cost THEN
            RETURN json_build_object('success', false, 'error', 'Insufficient balance to cover team entry');
        END IF;
        
        -- Deduct from owner
        UPDATE wallets 
        SET balance = balance - v_total_cost, 
            locked_balance = locked_balance + v_total_cost,
            updated_at = now()
        WHERE user_id = v_payer_id;
        
        -- Log transaction
        INSERT INTO transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_payer_id, 'lock', v_total_cost, p_match_id, 'Team entry fee (covering team)', 'completed');
        
    ELSE
        -- Split mode: each member pays their share
        FOR v_member IN 
            SELECT tm.user_id, p.username
            FROM team_members tm
            JOIN profiles p ON p.user_id = tm.user_id
            WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
        LOOP
            SELECT balance INTO v_member_balance FROM wallets WHERE user_id = v_member.user_id FOR UPDATE;
            
            IF v_member_balance IS NULL OR v_member_balance < v_match.entry_fee THEN
                RETURN json_build_object('success', false, 'error', 
                    'Member ' || v_member.username || ' has insufficient balance');
            END IF;
            
            -- Deduct from each member
            UPDATE wallets 
            SET balance = balance - v_match.entry_fee,
                locked_balance = locked_balance + v_match.entry_fee,
                updated_at = now()
            WHERE user_id = v_member.user_id;
            
            -- Log transaction for each
            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_member.user_id, 'lock', v_match.entry_fee, p_match_id, 'Team entry fee (split)', 'completed');
        END LOOP;
    END IF;

    -- Add all team members as participants (Team B)
    FOR v_member IN 
        SELECT user_id FROM team_members 
        WHERE team_id = p_team_id AND status = 'accepted'
    LOOP
        INSERT INTO match_participants (match_id, user_id, team_side, team_id)
        VALUES (p_match_id, v_member.user_id, 'B', p_team_id);
    END LOOP;

    -- Update match: set team_b and change status to ready_check (not full!)
    UPDATE matches 
    SET team_b_id = p_team_id,
        status = 'ready_check',  -- Changed from 'full' to 'ready_check'
        payment_mode_joiner = p_payment_mode
    WHERE id = p_match_id;

    RETURN json_build_object('success', true, 'message', 'Team joined match successfully');
END;
$$;

-- Fix any currently stuck matches that have status 'full'
-- These should be in 'ready_check' so players can ready up
UPDATE matches 
SET status = 'ready_check' 
WHERE status = 'full';