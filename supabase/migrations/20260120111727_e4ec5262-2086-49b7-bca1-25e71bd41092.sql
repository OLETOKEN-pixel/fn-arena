-- =====================================================
-- FIX: Add Challenge Event Triggers to Match Functions
-- =====================================================

-- 1. UPDATE complete_match_payout to trigger 'match_completed' for ALL participants
CREATE OR REPLACE FUNCTION public.complete_match_payout(p_match_id uuid, p_winner_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_match RECORD;
    v_entry_fee DECIMAL(10,2);
    v_prize_pool DECIMAL(10,2);
    v_platform_fee DECIMAL(10,2);
    v_winner_payout DECIMAL(10,2);
    v_loser_user_id UUID;
    v_participant RECORD;
BEGIN
    -- Get match details
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status = 'finished' THEN
        RETURN json_build_object('success', false, 'error', 'Match already finished');
    END IF;
    
    v_entry_fee := v_match.entry_fee;
    v_prize_pool := v_entry_fee * 2;
    v_platform_fee := v_prize_pool * 0.05;
    v_winner_payout := v_prize_pool - v_platform_fee;
    
    -- Find loser (the other participant)
    SELECT user_id INTO v_loser_user_id
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id != p_winner_user_id
    LIMIT 1;
    
    IF v_loser_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Loser not found');
    END IF;
    
    -- Unlock and pay winner (they get their entry back + opponent's entry - fee)
    UPDATE public.wallets
    SET 
        balance = balance + v_winner_payout,
        locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = p_winner_user_id;
    
    -- Remove loser's locked balance (they lose their entry fee)
    UPDATE public.wallets
    SET 
        locked_balance = locked_balance - v_entry_fee,
        updated_at = now()
    WHERE user_id = v_loser_user_id;
    
    -- Log winner payout transaction
    INSERT INTO public.transactions (user_id, type, amount, match_id, description)
    VALUES (p_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Match winnings');
    
    -- Log loser loss transaction
    INSERT INTO public.transactions (user_id, type, amount, match_id, description)
    VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Match entry lost');
    
    -- Record platform fee
    INSERT INTO public.platform_earnings (match_id, amount)
    VALUES (p_match_id, v_platform_fee);
    
    UPDATE public.platform_wallet
    SET balance = balance + v_platform_fee, updated_at = now();
    
    -- Update match status to finished
    UPDATE public.matches
    SET status = 'finished', finished_at = now()
    WHERE id = p_match_id;
    
    -- Update match result status to confirmed
    UPDATE public.match_results
    SET status = 'confirmed', winner_user_id = p_winner_user_id, updated_at = now()
    WHERE match_id = p_match_id;

    -- ========== CHALLENGE EVENTS ==========
    -- Record match_completed for ALL participants (winner and loser)
    FOR v_participant IN 
        SELECT user_id FROM public.match_participants WHERE match_id = p_match_id
    LOOP
        PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
    -- ======================================
    
    RETURN json_build_object(
        'success', true, 
        'winner_payout', v_winner_payout,
        'platform_fee', v_platform_fee
    );
END;
$function$;


-- 2. UPDATE set_player_ready to trigger 'ready_up_fast' and 'match_created_started'
CREATE OR REPLACE FUNCTION public.set_player_ready(p_match_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_participant RECORD;
    v_total_participants INT;
    v_ready_count INT;
    v_rows_updated INT;
    v_ready_at TIMESTAMPTZ;
    v_joined_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get match with lock
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status != 'ready_check' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not in ready check phase');
    END IF;
    
    -- Check if participant with lock
    SELECT * INTO v_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id
    FOR UPDATE;
    
    IF v_participant IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    IF v_participant.ready = TRUE THEN
        -- Already ready - return current state (idempotent)
        SELECT COUNT(*), COUNT(*) FILTER (WHERE ready = TRUE)
        INTO v_total_participants, v_ready_count
        FROM public.match_participants
        WHERE match_id = p_match_id;
        
        RETURN json_build_object('success', true, 'status', v_match.status, 'ready_count', v_ready_count, 'total', v_total_participants, 'already_ready', true);
    END IF;
    
    -- Set ready timestamp
    v_ready_at := now();
    v_joined_at := v_participant.joined_at;
    
    -- Set ready for this user
    UPDATE public.match_participants
    SET ready = TRUE, ready_at = v_ready_at
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    -- ========== CHALLENGE: Ready Up Fast ==========
    -- Check if ready within 2 minutes of joining
    IF v_joined_at IS NOT NULL AND (v_ready_at - v_joined_at) <= INTERVAL '2 minutes' THEN
        PERFORM record_challenge_event(v_user_id, 'ready_up_fast', p_match_id);
    END IF;
    -- ==============================================
    
    -- Count all participants and ready ones AFTER the update
    SELECT COUNT(*), COUNT(*) FILTER (WHERE ready = TRUE)
    INTO v_total_participants, v_ready_count
    FROM public.match_participants
    WHERE match_id = p_match_id;
    
    -- Log for debugging
    RAISE LOG 'set_player_ready: match=%, user=%, ready_count=%, total=%', p_match_id, v_user_id, v_ready_count, v_total_participants;
    
    -- Check if ALL participants are ready
    IF v_ready_count >= v_total_participants AND v_total_participants >= 2 THEN
        -- All ready - start match with idempotency guard
        UPDATE public.matches
        SET status = 'in_progress', started_at = now()
        WHERE id = p_match_id AND status = 'ready_check';
        
        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        
        IF v_rows_updated > 0 THEN
            RAISE LOG 'set_player_ready: match % transitioned to in_progress', p_match_id;
            
            -- ========== CHALLENGE: Match Created Started ==========
            -- Trigger for the match CREATOR only
            PERFORM record_challenge_event(v_match.creator_id, 'match_created_started', p_match_id);
            -- ======================================================
            
            RETURN json_build_object('success', true, 'status', 'in_progress', 'all_ready', true, 'ready_count', v_ready_count, 'total', v_total_participants);
        ELSE
            -- Already transitioned by concurrent call
            RETURN json_build_object('success', true, 'status', 'in_progress', 'all_ready', true, 'ready_count', v_ready_count, 'total', v_total_participants, 'concurrent', true);
        END IF;
    END IF;
    
    RETURN json_build_object('success', true, 'status', 'ready_check', 'ready_count', v_ready_count, 'total', v_total_participants);
END;
$function$;