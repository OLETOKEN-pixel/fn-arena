-- Function to complete match and process payout
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
    
    RETURN json_build_object(
        'success', true, 
        'winner_payout', v_winner_payout,
        'platform_fee', v_platform_fee
    );
END;
$function$;

-- Function to declare match result (called by participants)
CREATE OR REPLACE FUNCTION public.declare_match_result(p_match_id uuid, p_i_won boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_existing_result RECORD;
    v_opponent_id UUID;
    v_is_participant BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Check if user is participant
    SELECT EXISTS(
        SELECT 1 FROM public.match_participants 
        WHERE match_id = p_match_id AND user_id = v_user_id
    ) INTO v_is_participant;
    
    IF NOT v_is_participant THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    -- Get match
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status NOT IN ('full', 'started') THEN
        RETURN json_build_object('success', false, 'error', 'Match not in progress');
    END IF;
    
    -- Get opponent
    SELECT user_id INTO v_opponent_id
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id != v_user_id
    LIMIT 1;
    
    -- Check existing result
    SELECT * INTO v_existing_result
    FROM public.match_results
    WHERE match_id = p_match_id
    FOR UPDATE;
    
    IF v_existing_result IS NULL THEN
        -- First declaration - create result record
        IF p_i_won THEN
            INSERT INTO public.match_results (match_id, winner_user_id, winner_confirmed, status)
            VALUES (p_match_id, v_user_id, true, 'pending');
        ELSE
            -- User says they lost, so opponent won
            INSERT INTO public.match_results (match_id, winner_user_id, loser_confirmed, status)
            VALUES (p_match_id, v_opponent_id, true, 'pending');
        END IF;
        
        -- Update match to started if not already
        UPDATE public.matches SET status = 'started', started_at = COALESCE(started_at, now())
        WHERE id = p_match_id AND status = 'full';
        
        RETURN json_build_object('success', true, 'status', 'waiting_confirmation');
    ELSE
        -- Second declaration - check for agreement
        IF p_i_won THEN
            IF v_existing_result.winner_user_id = v_user_id THEN
                -- Both claim same winner (user) - confirmed!
                IF v_existing_result.loser_confirmed THEN
                    -- Opponent already confirmed they lost
                    PERFORM public.complete_match_payout(p_match_id, v_user_id);
                    RETURN json_build_object('success', true, 'status', 'confirmed', 'winner', v_user_id);
                ELSE
                    -- Update winner_confirmed
                    UPDATE public.match_results 
                    SET winner_confirmed = true, updated_at = now()
                    WHERE match_id = p_match_id;
                    RETURN json_build_object('success', true, 'status', 'waiting_loser_confirmation');
                END IF;
            ELSE
                -- DISPUTE: both claim they won
                UPDATE public.match_results 
                SET status = 'disputed', dispute_reason = 'Both players claim victory', updated_at = now()
                WHERE match_id = p_match_id;
                
                UPDATE public.matches SET status = 'disputed' WHERE id = p_match_id;
                
                RETURN json_build_object('success', true, 'status', 'disputed');
            END IF;
        ELSE
            -- User says they lost
            IF v_existing_result.winner_user_id = v_opponent_id THEN
                -- Agreement! Opponent claimed win, user confirms loss
                UPDATE public.match_results 
                SET loser_confirmed = true, updated_at = now()
                WHERE match_id = p_match_id;
                
                PERFORM public.complete_match_payout(p_match_id, v_opponent_id);
                RETURN json_build_object('success', true, 'status', 'confirmed', 'winner', v_opponent_id);
            ELSIF v_existing_result.winner_user_id = v_user_id THEN
                -- User previously claimed win, now says lost - update winner
                UPDATE public.match_results 
                SET winner_user_id = v_opponent_id, loser_confirmed = true, updated_at = now()
                WHERE match_id = p_match_id;
                
                IF v_existing_result.winner_confirmed THEN
                    -- This was a dispute scenario, now resolved
                    PERFORM public.complete_match_payout(p_match_id, v_opponent_id);
                    RETURN json_build_object('success', true, 'status', 'confirmed', 'winner', v_opponent_id);
                END IF;
                
                RETURN json_build_object('success', true, 'status', 'waiting_confirmation');
            END IF;
        END IF;
    END IF;
    
    RETURN json_build_object('success', true, 'status', 'updated');
END;
$function$;

-- Admin function to resolve disputes
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_match_id uuid, p_winner_user_id uuid, p_admin_notes text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Update result with admin decision
    UPDATE public.match_results
    SET 
        winner_user_id = p_winner_user_id,
        status = 'resolved',
        resolved_by = auth.uid(),
        admin_notes = p_admin_notes,
        updated_at = now()
    WHERE match_id = p_match_id;
    
    -- Process payout
    PERFORM public.complete_match_payout(p_match_id, p_winner_user_id);
    
    RETURN json_build_object('success', true);
END;
$function$;