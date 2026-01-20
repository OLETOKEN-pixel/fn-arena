-- =====================================================
-- FIX 2: Complete Challenge Event Integration
-- =====================================================

-- 1. Update handle_proof_challenge_event to include more statuses
CREATE OR REPLACE FUNCTION public.handle_proof_challenge_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match RECORD;
BEGIN
  -- Get match info to ensure it's valid
  SELECT * INTO v_match FROM matches WHERE id = NEW.match_id;
  
  -- Count if match exists and has valid status (including admin_resolved and completed)
  IF v_match IS NOT NULL AND v_match.status IN ('in_progress', 'result_pending', 'completed', 'finished', 'admin_resolved', 'disputed', 'started', 'full', 'ready_check') THEN
    PERFORM record_challenge_event(NEW.user_id, 'proof_uploaded', NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Update finalize_team_match to trigger challenge events
CREATE OR REPLACE FUNCTION public.finalize_team_match(p_match_id uuid, p_winner_side text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_match RECORD;
    v_winner_team_id UUID;
    v_loser_team_id UUID;
    v_winner_captain_id UUID;
    v_loser_captain_id UUID;
    v_winner_payment_mode TEXT;
    v_loser_payment_mode TEXT;
    v_entry_fee NUMERIC;
    v_team_size INT;
    v_total_pool NUMERIC;
    v_platform_fee NUMERIC;
    v_prize_pool NUMERIC;
    v_payout_per_member NUMERIC;
    v_participant RECORD;
    v_loser_side TEXT;
BEGIN
    -- Get match info
    SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    v_entry_fee := v_match.entry_fee;
    v_team_size := v_match.team_size;
    v_loser_side := CASE WHEN p_winner_side = 'A' THEN 'B' ELSE 'A' END;
    
    -- Calculate prize pool: entry_fee * team_size * 2 teams
    v_total_pool := v_entry_fee * v_team_size * 2;
    v_platform_fee := v_total_pool * 0.05;
    v_prize_pool := v_total_pool - v_platform_fee;
    
    -- Determine payment modes and team IDs
    IF p_winner_side = 'A' THEN
        v_winner_team_id := v_match.team_a_id;
        v_loser_team_id := v_match.team_b_id;
        v_winner_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
        v_loser_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
    ELSE
        v_winner_team_id := v_match.team_b_id;
        v_loser_team_id := v_match.team_a_id;
        v_winner_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
        v_loser_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
    END IF;
    
    -- Get captains
    v_winner_captain_id := (SELECT user_id FROM public.match_participants 
        WHERE match_id = p_match_id AND team_side = p_winner_side 
        ORDER BY joined_at ASC LIMIT 1);
    v_loser_captain_id := (SELECT user_id FROM public.match_participants 
        WHERE match_id = p_match_id AND team_side = v_loser_side 
        ORDER BY joined_at ASC LIMIT 1);
    
    -- ========================================
    -- PROCESS LOSER SIDE (unlock locked funds)
    -- ========================================
    IF v_loser_payment_mode = 'cover' THEN
        UPDATE public.wallets
        SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
            updated_at = now()
        WHERE user_id = v_loser_captain_id AND id IS NOT NULL;
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_captain_id, 'fee', v_entry_fee * v_team_size, p_match_id, 
            'Match perso (Cover All - ' || v_team_size || ' giocatori)', 'completed');
    ELSE
        FOR v_participant IN 
            SELECT user_id FROM public.match_participants 
            WHERE match_id = p_match_id AND team_side = v_loser_side
        LOOP
            UPDATE public.wallets
            SET locked_balance = locked_balance - v_entry_fee,
                updated_at = now()
            WHERE user_id = v_participant.user_id AND id IS NOT NULL;
            
            INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_participant.user_id, 'fee', v_entry_fee, p_match_id, 
                'Match perso (Split Pay)', 'completed');
        END LOOP;
    END IF;
    
    -- ========================================
    -- PROCESS WINNER SIDE (payout winnings)
    -- ========================================
    IF v_winner_payment_mode = 'cover' THEN
        UPDATE public.wallets
        SET balance = balance + v_prize_pool,
            locked_balance = locked_balance - (v_entry_fee * v_team_size),
            updated_at = now()
        WHERE user_id = v_winner_captain_id AND id IS NOT NULL;
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_captain_id, 'payout', v_prize_pool, p_match_id, 
            'Vittoria match (Cover All - Pool: ' || v_total_pool || ' Coins)', 'completed');
    ELSE
        v_payout_per_member := v_prize_pool / v_team_size;
        
        FOR v_participant IN 
            SELECT user_id FROM public.match_participants 
            WHERE match_id = p_match_id AND team_side = p_winner_side
        LOOP
            UPDATE public.wallets
            SET balance = balance + v_payout_per_member,
                locked_balance = locked_balance - v_entry_fee,
                updated_at = now()
            WHERE user_id = v_participant.user_id AND id IS NOT NULL;
            
            INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_participant.user_id, 'payout', v_payout_per_member, p_match_id, 
                'Vittoria match (Split Pay)', 'completed');
        END LOOP;
    END IF;
    
    -- Record platform fee
    INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
    UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now();
    
    -- Update match
    UPDATE public.matches 
    SET status = 'finished', finished_at = now() 
    WHERE id = p_match_id;
    
    -- Update result
    UPDATE public.match_results 
    SET status = 'confirmed', winner_team_id = v_winner_team_id, updated_at = now()
    WHERE match_id = p_match_id;

    -- ========== CHALLENGE EVENTS ==========
    -- Record match_completed for ALL participants
    FOR v_participant IN 
        SELECT user_id FROM public.match_participants WHERE match_id = p_match_id
    LOOP
        PERFORM record_challenge_event(v_participant.user_id, 'match_completed', p_match_id);
    END LOOP;
    -- ======================================
    
    RETURN json_build_object(
        'success', true, 
        'winner_side', p_winner_side,
        'prize_pool', v_prize_pool,
        'platform_fee', v_platform_fee
    );
END;
$$;