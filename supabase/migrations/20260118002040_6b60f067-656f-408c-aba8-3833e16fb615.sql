-- Fix: Add WHERE clause to platform_wallet updates in both functions

-- 1. Fix submit_match_result - add WHERE clause to platform_wallet updates
CREATE OR REPLACE FUNCTION public.submit_match_result(p_match_id uuid, p_result text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_participant RECORD;
    v_all_voted BOOLEAN;
    v_team_a_result TEXT;
    v_team_b_result TEXT;
    v_winner_user_id UUID;
    v_loser_user_id UUID;
    v_entry_fee DECIMAL(10,2);
    v_prize_pool DECIMAL(10,2);
    v_platform_fee DECIMAL(10,2);
    v_winner_payout DECIMAL(10,2);
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    IF p_result NOT IN ('WIN', 'LOSS') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
    END IF;
    
    -- Get match
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status NOT IN ('in_progress', 'result_pending') THEN
        RETURN json_build_object('success', false, 'error', 'Match is not in progress');
    END IF;
    
    -- Check if participant
    SELECT * INTO v_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id
    FOR UPDATE;
    
    IF v_participant IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    IF v_participant.result_choice IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Already submitted result');
    END IF;
    
    -- Save result
    UPDATE public.match_participants
    SET result_choice = p_result, result_at = now()
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    -- Update match to result_pending if not already
    IF v_match.status = 'in_progress' THEN
        UPDATE public.matches SET status = 'result_pending' WHERE id = p_match_id;
    END IF;
    
    -- Check if all have voted
    IF EXISTS (SELECT 1 FROM public.match_participants WHERE match_id = p_match_id AND result_choice IS NULL) THEN
        RETURN json_build_object('success', true, 'status', 'waiting_opponent');
    END IF;
    
    -- All voted - analyze results
    SELECT result_choice INTO v_team_a_result
    FROM public.match_participants
    WHERE match_id = p_match_id AND team_side = 'A'
    LIMIT 1;
    
    SELECT result_choice INTO v_team_b_result
    FROM public.match_participants
    WHERE match_id = p_match_id AND team_side = 'B'
    LIMIT 1;
    
    -- Check for agreement
    IF (v_team_a_result = 'WIN' AND v_team_b_result = 'LOSS') THEN
        -- Team A wins
        SELECT user_id INTO v_winner_user_id FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'A' LIMIT 1;
        SELECT user_id INTO v_loser_user_id FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'B' LIMIT 1;
        
        -- Process payout
        v_entry_fee := v_match.entry_fee;
        v_prize_pool := v_entry_fee * 2;
        v_platform_fee := v_prize_pool * 0.05;
        v_winner_payout := v_prize_pool - v_platform_fee;
        
        -- Pay winner
        UPDATE public.wallets
        SET balance = balance + v_winner_payout, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_winner_user_id;
        
        -- Remove loser locked
        UPDATE public.wallets
        SET locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_loser_user_id;
        
        -- Log transactions
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Match winnings', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Match entry lost', 'completed');
        
        -- Record platform fee - FIX: add WHERE clause
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now()
        WHERE id IS NOT NULL;
        
        -- Update match
        UPDATE public.matches SET status = 'completed', finished_at = now() WHERE id = p_match_id;
        
        -- Create result record
        INSERT INTO public.match_results (match_id, winner_user_id, loser_confirmed, winner_confirmed, status)
        VALUES (p_match_id, v_winner_user_id, true, true, 'confirmed')
        ON CONFLICT (match_id) DO UPDATE SET winner_user_id = v_winner_user_id, status = 'confirmed', updated_at = now();
        
        RETURN json_build_object('success', true, 'status', 'completed', 'winner', v_winner_user_id);
        
    ELSIF (v_team_a_result = 'LOSS' AND v_team_b_result = 'WIN') THEN
        -- Team B wins
        SELECT user_id INTO v_winner_user_id FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'B' LIMIT 1;
        SELECT user_id INTO v_loser_user_id FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'A' LIMIT 1;
        
        -- Process payout
        v_entry_fee := v_match.entry_fee;
        v_prize_pool := v_entry_fee * 2;
        v_platform_fee := v_prize_pool * 0.05;
        v_winner_payout := v_prize_pool - v_platform_fee;
        
        -- Pay winner
        UPDATE public.wallets
        SET balance = balance + v_winner_payout, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_winner_user_id;
        
        -- Remove loser locked
        UPDATE public.wallets
        SET locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_loser_user_id;
        
        -- Log transactions
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Match winnings', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Match entry lost', 'completed');
        
        -- Record platform fee - FIX: add WHERE clause
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now()
        WHERE id IS NOT NULL;
        
        -- Update match
        UPDATE public.matches SET status = 'completed', finished_at = now() WHERE id = p_match_id;
        
        -- Create result record
        INSERT INTO public.match_results (match_id, winner_user_id, loser_confirmed, winner_confirmed, status)
        VALUES (p_match_id, v_winner_user_id, true, true, 'confirmed')
        ON CONFLICT (match_id) DO UPDATE SET winner_user_id = v_winner_user_id, status = 'confirmed', updated_at = now();
        
        RETURN json_build_object('success', true, 'status', 'completed', 'winner', v_winner_user_id);
        
    ELSE
        -- Dispute: both WIN or both LOSS
        UPDATE public.matches SET status = 'disputed' WHERE id = p_match_id;
        
        INSERT INTO public.match_results (match_id, status, dispute_reason)
        VALUES (p_match_id, 'disputed', 
            CASE 
                WHEN v_team_a_result = 'WIN' AND v_team_b_result = 'WIN' THEN 'Both players claimed victory'
                ELSE 'Both players claimed loss'
            END
        )
        ON CONFLICT (match_id) DO UPDATE SET status = 'disputed', dispute_reason = 
            CASE 
                WHEN v_team_a_result = 'WIN' AND v_team_b_result = 'WIN' THEN 'Both players claimed victory'
                ELSE 'Both players claimed loss'
            END, updated_at = now();
        
        RETURN json_build_object('success', true, 'status', 'disputed');
    END IF;
END;
$function$;

-- 2. Fix admin_resolve_match_v2 - add WHERE clause to platform_wallet update
CREATE OR REPLACE FUNCTION public.admin_resolve_match_v2(p_match_id uuid, p_action text, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_match RECORD;
    v_team_a_user UUID;
    v_team_b_user UUID;
    v_winner_user_id UUID;
    v_loser_user_id UUID;
    v_entry_fee DECIMAL(10,2);
    v_prize_pool DECIMAL(10,2);
    v_platform_fee DECIMAL(10,2);
    v_winner_payout DECIMAL(10,2);
    v_existing_payout INT;
    v_winner_locked DECIMAL(10,2);
    v_loser_locked DECIMAL(10,2);
BEGIN
    -- Check admin permission
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    IF p_action NOT IN ('TEAM_A_WIN', 'TEAM_B_WIN', 'REFUND_BOTH') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid action. Must be TEAM_A_WIN, TEAM_B_WIN, or REFUND_BOTH');
    END IF;
    
    -- Get match with lock
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    -- Idempotency: if already resolved, return success
    IF v_match.status IN ('admin_resolved', 'completed') THEN
        RAISE LOG 'admin_resolve_match_v2: match % already resolved (status=%)', p_match_id, v_match.status;
        RETURN json_build_object('success', true, 'already_resolved', true, 'status', v_match.status);
    END IF;
    
    -- Only allow resolution of disputed matches (strict)
    IF v_match.status != 'disputed' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not in disputed status. Current status: ' || v_match.status);
    END IF;
    
    -- Get participants with fallback for team_side
    SELECT user_id INTO v_team_a_user 
    FROM public.match_participants 
    WHERE match_id = p_match_id AND team_side = 'A' 
    LIMIT 1;
    
    SELECT user_id INTO v_team_b_user 
    FROM public.match_participants 
    WHERE match_id = p_match_id AND team_side = 'B' 
    LIMIT 1;
    
    -- Fallback if team_side is NULL
    IF v_team_a_user IS NULL THEN
        v_team_a_user := v_match.creator_id;
    END IF;
    
    IF v_team_b_user IS NULL THEN
        SELECT user_id INTO v_team_b_user 
        FROM public.match_participants 
        WHERE match_id = p_match_id AND user_id != v_match.creator_id
        LIMIT 1;
    END IF;
    
    -- Validate both participants exist
    IF v_team_a_user IS NULL OR v_team_b_user IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Missing participants for resolution');
    END IF;
    
    -- Check for existing payout (idempotency)
    SELECT COUNT(*) INTO v_existing_payout
    FROM public.transactions 
    WHERE match_id = p_match_id AND type IN ('payout', 'refund');
    
    IF v_existing_payout > 0 THEN
        RAISE LOG 'admin_resolve_match_v2: match % already has payout/refund transactions', p_match_id;
        RETURN json_build_object('success', true, 'already_resolved', true, 'existing_transactions', v_existing_payout);
    END IF;
    
    v_entry_fee := v_match.entry_fee;
    v_prize_pool := v_entry_fee * 2;
    v_platform_fee := v_prize_pool * 0.05;
    v_winner_payout := v_prize_pool - v_platform_fee;
    
    RAISE LOG 'admin_resolve_match_v2: match=%, action=%, team_a=%, team_b=%, entry_fee=%, prize=%', 
        p_match_id, p_action, v_team_a_user, v_team_b_user, v_entry_fee, v_prize_pool;
    
    IF p_action = 'REFUND_BOTH' THEN
        -- Validate locked_balance before refund
        SELECT locked_balance INTO v_winner_locked FROM public.wallets WHERE user_id = v_team_a_user FOR UPDATE;
        SELECT locked_balance INTO v_loser_locked FROM public.wallets WHERE user_id = v_team_b_user FOR UPDATE;
        
        IF v_winner_locked < v_entry_fee OR v_loser_locked < v_entry_fee THEN
            RAISE LOG 'admin_resolve_match_v2: insufficient locked_balance for refund. A=%, B=%, required=%', 
                v_winner_locked, v_loser_locked, v_entry_fee;
            RETURN json_build_object('success', false, 'error', 'Insufficient locked balance for refund');
        END IF;
        
        -- Refund both players
        UPDATE public.wallets
        SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_team_a_user;
        
        UPDATE public.wallets
        SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_team_b_user;
        
        -- Log refund transactions
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_team_a_user, 'refund', v_entry_fee, p_match_id, 'Admin resolved - refund', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_team_b_user, 'refund', v_entry_fee, p_match_id, 'Admin resolved - refund', 'completed');
        
        -- Update match status
        UPDATE public.matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;
        
        -- Update/insert match result
        INSERT INTO public.match_results (match_id, status, admin_notes, resolved_by)
        VALUES (p_match_id, 'resolved', p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET status = 'resolved', admin_notes = p_notes, resolved_by = auth.uid(), updated_at = now();
        
        RAISE LOG 'admin_resolve_match_v2: match % resolved with REFUND_BOTH', p_match_id;
        RETURN json_build_object('success', true, 'action', 'refund_both', 'refunded_amount', v_entry_fee);
    ELSE
        -- Assign winner based on action
        IF p_action = 'TEAM_A_WIN' THEN
            v_winner_user_id := v_team_a_user;
            v_loser_user_id := v_team_b_user;
        ELSE
            v_winner_user_id := v_team_b_user;
            v_loser_user_id := v_team_a_user;
        END IF;
        
        -- Validate locked_balance before payout
        SELECT locked_balance INTO v_winner_locked FROM public.wallets WHERE user_id = v_winner_user_id FOR UPDATE;
        SELECT locked_balance INTO v_loser_locked FROM public.wallets WHERE user_id = v_loser_user_id FOR UPDATE;
        
        IF v_winner_locked < v_entry_fee OR v_loser_locked < v_entry_fee THEN
            RAISE LOG 'admin_resolve_match_v2: insufficient locked_balance. winner=%, loser=%, required=%', 
                v_winner_locked, v_loser_locked, v_entry_fee;
            RETURN json_build_object('success', false, 'error', 'Insufficient locked balance for payout');
        END IF;
        
        -- Pay winner (their entry back + opponent's entry - platform fee)
        UPDATE public.wallets
        SET balance = balance + v_winner_payout, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_winner_user_id;
        
        -- Remove loser's locked balance
        UPDATE public.wallets
        SET locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_loser_user_id;
        
        -- Log transactions
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Admin resolved - winnings', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Admin resolved - loss', 'completed');
        
        -- Record platform fee - FIX: add WHERE clause
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now()
        WHERE id IS NOT NULL;
        
        -- Update match status
        UPDATE public.matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;
        
        -- Update/insert match result
        INSERT INTO public.match_results (match_id, winner_user_id, status, admin_notes, resolved_by)
        VALUES (p_match_id, v_winner_user_id, 'resolved', p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET winner_user_id = v_winner_user_id, status = 'resolved', admin_notes = p_notes, resolved_by = auth.uid(), updated_at = now();
        
        RAISE LOG 'admin_resolve_match_v2: match % resolved. winner=%, payout=%, platform_fee=%', 
            p_match_id, v_winner_user_id, v_winner_payout, v_platform_fee;
        
        RETURN json_build_object('success', true, 'action', p_action, 'winner', v_winner_user_id, 'payout', v_winner_payout, 'platform_fee', v_platform_fee);
    END IF;
END;
$function$;