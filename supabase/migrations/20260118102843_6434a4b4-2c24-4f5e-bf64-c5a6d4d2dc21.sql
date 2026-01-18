-- ============================================
-- FIX 1: Create expire_stale_matches function
-- ============================================
CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match RECORD;
    v_participant RECORD;
    v_refund_amount NUMERIC;
BEGIN
    -- Find all open matches that have expired
    FOR v_match IN 
        SELECT m.id, m.creator_id, m.entry_fee, m.team_size, m.payment_mode_host
        FROM matches m
        WHERE m.status = 'open' AND m.expires_at < now()
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Calculate refund amount for creator (based on payment mode)
        IF v_match.payment_mode_host = 'cover' THEN
            v_refund_amount := v_match.entry_fee * v_match.team_size;
        ELSE
            v_refund_amount := v_match.entry_fee;
        END IF;
        
        -- Refund creator's locked balance
        UPDATE wallets 
        SET balance = balance + v_refund_amount,
            locked_balance = locked_balance - v_refund_amount,
            updated_at = now()
        WHERE user_id = v_match.creator_id
          AND id IS NOT NULL;
        
        -- Log refund transaction
        INSERT INTO transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_match.creator_id, 'refund', v_refund_amount, v_match.id, 'Match expired - auto refund', 'completed');
        
        -- Also refund any other participants who may have joined (edge case)
        FOR v_participant IN
            SELECT mp.user_id, mp.team_side
            FROM match_participants mp
            WHERE mp.match_id = v_match.id AND mp.user_id != v_match.creator_id
        LOOP
            -- Refund participant
            UPDATE wallets 
            SET balance = balance + v_match.entry_fee,
                locked_balance = locked_balance - v_match.entry_fee,
                updated_at = now()
            WHERE user_id = v_participant.user_id
              AND id IS NOT NULL;
            
            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 'Match expired - auto refund', 'completed');
        END LOOP;
        
        -- Update match status to expired
        UPDATE matches SET status = 'expired', finished_at = now() WHERE id = v_match.id AND id IS NOT NULL;
    END LOOP;
END;
$$;

-- ============================================
-- FIX 2: Update admin_resolve_match_v2 to fix idempotency check
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_resolve_match_v2(
    p_match_id UUID,
    p_action TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match RECORD;
    v_team_a RECORD;
    v_team_b RECORD;
    v_winner_side TEXT;
    v_winner_user_id UUID;
    v_loser_user_id UUID;
    v_total_pool NUMERIC;
    v_platform_fee NUMERIC;
    v_winner_payout NUMERIC;
    v_existing_admin_payout INT;
    v_participant RECORD;
    v_refund_amount NUMERIC;
BEGIN
    -- Verify admin
    IF NOT is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Lock and fetch match
    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    -- Check if already resolved by admin (look for admin-specific transactions)
    SELECT COUNT(*) INTO v_existing_admin_payout
    FROM transactions 
    WHERE match_id = p_match_id 
      AND type IN ('payout', 'refund')
      AND description LIKE 'Admin resolved%';
    
    IF v_existing_admin_payout > 0 THEN
        -- Already resolved by admin, just ensure status is correct
        IF v_match.status NOT IN ('admin_resolved', 'completed') THEN
            UPDATE matches 
            SET status = 'admin_resolved', finished_at = COALESCE(finished_at, now()) 
            WHERE id = p_match_id AND id IS NOT NULL;
        END IF;
        RETURN json_build_object('success', true, 'already_resolved', true, 'message', 'Match was already resolved by admin');
    END IF;
    
    -- Allow resolution of disputed OR result_pending matches
    IF v_match.status NOT IN ('disputed', 'result_pending', 'in_progress') THEN
        RETURN json_build_object('success', false, 'error', 'Match cannot be resolved in current status: ' || v_match.status);
    END IF;

    -- Get participants
    SELECT mp.*, p.username INTO v_team_a
    FROM match_participants mp
    JOIN profiles p ON p.user_id = mp.user_id
    WHERE mp.match_id = p_match_id AND mp.team_side = 'A'
    LIMIT 1;
    
    SELECT mp.*, p.username INTO v_team_b
    FROM match_participants mp
    JOIN profiles p ON p.user_id = mp.user_id
    WHERE mp.match_id = p_match_id AND mp.team_side = 'B'
    LIMIT 1;

    IF v_team_a IS NULL OR v_team_b IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Missing participants');
    END IF;

    -- Calculate pool
    v_total_pool := v_match.entry_fee * v_match.team_size * 2;
    v_platform_fee := v_total_pool * 0.05;
    v_winner_payout := v_total_pool - v_platform_fee;

    IF p_action = 'REFUND_BOTH' THEN
        -- Refund all participants
        FOR v_participant IN
            SELECT mp.user_id, mp.team_side
            FROM match_participants mp
            WHERE mp.match_id = p_match_id
        LOOP
            -- Calculate refund based on payment mode
            IF v_participant.team_side = 'A' THEN
                IF v_match.payment_mode_host = 'cover' THEN
                    v_refund_amount := v_match.entry_fee * v_match.team_size;
                ELSE
                    v_refund_amount := v_match.entry_fee;
                END IF;
            ELSE
                IF v_match.payment_mode_joiner = 'cover' THEN
                    v_refund_amount := v_match.entry_fee * v_match.team_size;
                ELSE
                    v_refund_amount := v_match.entry_fee;
                END IF;
            END IF;
            
            -- Unlock and refund
            UPDATE wallets 
            SET balance = balance + v_refund_amount,
                locked_balance = locked_balance - v_refund_amount,
                updated_at = now()
            WHERE user_id = v_participant.user_id
              AND id IS NOT NULL;
            
            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_participant.user_id, 'refund', v_refund_amount, p_match_id, 
                    'Admin resolved: Refund - ' || COALESCE(p_notes, 'No notes'), 'completed');
        END LOOP;
        
        -- Update match result
        INSERT INTO match_results (match_id, status, admin_notes, resolved_by)
        VALUES (p_match_id, 'refunded', p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET
            status = 'refunded',
            admin_notes = p_notes,
            resolved_by = auth.uid(),
            updated_at = now();
        
        -- Update match status
        UPDATE matches 
        SET status = 'admin_resolved', finished_at = now() 
        WHERE id = p_match_id AND id IS NOT NULL;
        
        RETURN json_build_object('success', true, 'action', 'REFUND_BOTH');
        
    ELSIF p_action IN ('TEAM_A_WIN', 'TEAM_B_WIN') THEN
        -- Determine winner/loser
        IF p_action = 'TEAM_A_WIN' THEN
            v_winner_side := 'A';
            v_winner_user_id := v_team_a.user_id;
            v_loser_user_id := v_team_b.user_id;
        ELSE
            v_winner_side := 'B';
            v_winner_user_id := v_team_b.user_id;
            v_loser_user_id := v_team_a.user_id;
        END IF;
        
        -- Unlock loser's funds (remove from locked, don't add to balance)
        IF v_winner_side = 'A' THEN
            IF v_match.payment_mode_joiner = 'cover' THEN
                v_refund_amount := v_match.entry_fee * v_match.team_size;
            ELSE
                v_refund_amount := v_match.entry_fee;
            END IF;
        ELSE
            IF v_match.payment_mode_host = 'cover' THEN
                v_refund_amount := v_match.entry_fee * v_match.team_size;
            ELSE
                v_refund_amount := v_match.entry_fee;
            END IF;
        END IF;
        
        UPDATE wallets 
        SET locked_balance = locked_balance - v_refund_amount,
            updated_at = now()
        WHERE user_id = v_loser_user_id
          AND id IS NOT NULL;
        
        -- Unlock winner's funds and add payout
        IF v_winner_side = 'A' THEN
            IF v_match.payment_mode_host = 'cover' THEN
                v_refund_amount := v_match.entry_fee * v_match.team_size;
            ELSE
                v_refund_amount := v_match.entry_fee;
            END IF;
        ELSE
            IF v_match.payment_mode_joiner = 'cover' THEN
                v_refund_amount := v_match.entry_fee * v_match.team_size;
            ELSE
                v_refund_amount := v_match.entry_fee;
            END IF;
        END IF;
        
        UPDATE wallets 
        SET balance = balance + v_winner_payout,
            locked_balance = locked_balance - v_refund_amount,
            updated_at = now()
        WHERE user_id = v_winner_user_id
          AND id IS NOT NULL;
        
        -- Record transactions
        INSERT INTO transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_user_id, 'payout', v_winner_payout, p_match_id, 
                'Admin resolved: Winner - ' || COALESCE(p_notes, 'No notes'), 'completed');
        
        -- Record platform fee
        INSERT INTO platform_earnings (match_id, amount)
        VALUES (p_match_id, v_platform_fee);
        
        UPDATE platform_wallet 
        SET balance = balance + v_platform_fee, updated_at = now()
        WHERE id IS NOT NULL;
        
        -- Update match result
        INSERT INTO match_results (match_id, status, winner_user_id, admin_notes, resolved_by)
        VALUES (p_match_id, 'resolved', v_winner_user_id, p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET
            status = 'resolved',
            winner_user_id = v_winner_user_id,
            admin_notes = p_notes,
            resolved_by = auth.uid(),
            updated_at = now();
        
        -- Update match status
        UPDATE matches 
        SET status = 'admin_resolved', finished_at = now() 
        WHERE id = p_match_id AND id IS NOT NULL;
        
        RETURN json_build_object('success', true, 'action', p_action, 'winner', v_winner_user_id);
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid action: ' || p_action);
    END IF;
END;
$$;

-- ============================================
-- FIX 3: Update join_match_v2 to check expiration and call lazy cleanup
-- ============================================
DROP FUNCTION IF EXISTS public.join_match_v2(UUID);

CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_match RECORD;
    v_entry_fee NUMERIC;
    v_wallet RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check if user already has an active match
    IF public.has_active_match(v_user_id) THEN
        RETURN json_build_object('success', false, 'error', 'You already have an active match. Complete or cancel it before joining another.');
    END IF;

    -- Lock and fetch match
    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- Check if match is expired
    IF v_match.expires_at < now() THEN
        -- Lazy cleanup: expire this match
        PERFORM public.expire_stale_matches();
        RETURN json_build_object('success', false, 'error', 'This match has expired');
    END IF;

    IF v_match.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not open for joining');
    END IF;

    -- Only allow 1v1 matches through this function
    IF v_match.team_size != 1 THEN
        RETURN json_build_object('success', false, 'error', 'Use join_team_match for team matches');
    END IF;

    IF v_match.creator_id = v_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot join your own match');
    END IF;

    v_entry_fee := v_match.entry_fee;

    -- Check wallet
    SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
    
    IF v_wallet IS NULL OR v_wallet.balance < v_entry_fee THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- Lock funds
    UPDATE wallets 
    SET balance = balance - v_entry_fee,
        locked_balance = locked_balance + v_entry_fee,
        updated_at = now()
    WHERE user_id = v_user_id AND id IS NOT NULL;

    -- Record lock transaction
    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_user_id, 'lock', v_entry_fee, p_match_id, 'Entry fee locked for match', 'completed');

    -- Add as participant (Team B)
    INSERT INTO match_participants (match_id, user_id, team_side, status)
    VALUES (p_match_id, v_user_id, 'B', 'joined');

    -- Update match status to full (ready for ready-check)
    UPDATE matches 
    SET status = 'full', payment_mode_joiner = 'cover'
    WHERE id = p_match_id AND id IS NOT NULL;

    RETURN json_build_object('success', true, 'status', 'full');
END;
$$;

-- ============================================
-- FIX 4: Update join_team_match to check expiration
-- ============================================
DROP FUNCTION IF EXISTS public.join_team_match(UUID, UUID, TEXT);

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
BEGIN
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check if team already has an active match
    IF public.team_has_active_match(p_team_id) THEN
        RETURN json_build_object('success', false, 'error', 'This team already has an active match. Complete or cancel it before joining another.');
    END IF;

    -- Lock and fetch match
    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- Check if match is expired
    IF v_match.expires_at < now() THEN
        -- Lazy cleanup: expire this match
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

    -- Add all team members as participants
    FOR v_member IN 
        SELECT tm.user_id 
        FROM team_members tm 
        WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
        INSERT INTO match_participants (match_id, user_id, team_id, team_side, status)
        VALUES (p_match_id, v_member.user_id, p_team_id, 'B', 'joined');
    END LOOP;

    -- Update match
    UPDATE matches 
    SET status = 'full', 
        team_b_id = p_team_id,
        payment_mode_joiner = p_payment_mode
    WHERE id = p_match_id AND id IS NOT NULL;

    RETURN json_build_object('success', true, 'status', 'full');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;