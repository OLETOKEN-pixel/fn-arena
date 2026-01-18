-- =========================================================================
-- COMPREHENSIVE FIX: Team Match Result Declaration & Wallet Reconciliation
-- =========================================================================

-- Part 1: Create submit_team_result - Captain-only result declaration
-- Part 2: Fix finalize_team_match with proper COVER/SPLIT payout logic
-- Part 3: Fix expire_stale_matches for team refunds
-- Part 4: Cleanup ghost locks migration
-- Part 5: Add better transaction descriptions

-- =========================================================================
-- PART 1: Captain-only team result submission
-- =========================================================================

CREATE OR REPLACE FUNCTION public.submit_team_result(p_match_id uuid, p_result text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_participant RECORD;
    v_user_team_side TEXT;
    v_is_captain BOOLEAN := FALSE;
    v_team_id UUID;
    v_other_team_result TEXT;
    v_other_side TEXT;
    v_winner_side TEXT;
    v_loser_side TEXT;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    IF p_result NOT IN ('WIN', 'LOSS') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid result. Must be WIN or LOSS');
    END IF;
    
    -- Get match with lock
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
    
    -- Get participant info
    SELECT * INTO v_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    IF v_participant IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    v_user_team_side := v_participant.team_side;
    v_team_id := v_participant.team_id;
    
    -- Determine if user is captain (team owner)
    -- For Team A (host side): captain is the match creator
    -- For Team B (joiner side): captain is the team owner
    IF v_user_team_side = 'A' THEN
        v_is_captain := (v_user_id = v_match.creator_id);
    ELSE
        -- Check if user is the team owner
        SELECT (owner_id = v_user_id) INTO v_is_captain
        FROM public.teams
        WHERE id = v_team_id;
    END IF;
    
    -- For 1v1 matches, everyone is their own captain
    IF v_match.team_size = 1 THEN
        v_is_captain := TRUE;
    END IF;
    
    IF NOT v_is_captain THEN
        RETURN json_build_object('success', false, 'error', 'Solo il capitano del team può dichiarare il risultato');
    END IF;
    
    -- Check if team already submitted result
    IF EXISTS (
        SELECT 1 FROM public.match_participants 
        WHERE match_id = p_match_id AND team_side = v_user_team_side AND result_choice IS NOT NULL
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Il tuo team ha già dichiarato il risultato');
    END IF;
    
    -- Update ALL team members' result with captain's choice
    UPDATE public.match_participants
    SET result_choice = p_result, result_at = now()
    WHERE match_id = p_match_id AND team_side = v_user_team_side;
    
    -- Update match status to result_pending
    IF v_match.status = 'in_progress' THEN
        UPDATE public.matches SET status = 'result_pending' WHERE id = p_match_id;
    END IF;
    
    -- Check if other team has submitted
    v_other_side := CASE WHEN v_user_team_side = 'A' THEN 'B' ELSE 'A' END;
    
    SELECT result_choice INTO v_other_team_result
    FROM public.match_participants
    WHERE match_id = p_match_id AND team_side = v_other_side
    LIMIT 1;
    
    IF v_other_team_result IS NULL THEN
        RETURN json_build_object('success', true, 'status', 'waiting_opponent', 
            'message', 'Risultato registrato. In attesa del team avversario.');
    END IF;
    
    -- Both teams have submitted - check for agreement
    IF (p_result = 'WIN' AND v_other_team_result = 'LOSS') OR (p_result = 'LOSS' AND v_other_team_result = 'WIN') THEN
        -- Agreement! Finalize match
        IF p_result = 'WIN' THEN
            v_winner_side := v_user_team_side;
            v_loser_side := v_other_side;
        ELSE
            v_winner_side := v_other_side;
            v_loser_side := v_user_team_side;
        END IF;
        
        -- Call finalize function
        RETURN finalize_team_match(p_match_id, v_winner_side);
    ELSE
        -- Conflict! Open dispute
        UPDATE public.matches SET status = 'disputed' WHERE id = p_match_id;
        
        INSERT INTO public.match_results (match_id, status, dispute_reason)
        VALUES (p_match_id, 'disputed', 'Entrambi i team hanno dichiarato vittoria')
        ON CONFLICT (match_id) DO UPDATE SET 
            status = 'disputed',
            dispute_reason = 'Entrambi i team hanno dichiarato vittoria',
            updated_at = now();
        
        RETURN json_build_object('success', true, 'status', 'disputed',
            'message', 'Conflitto nei risultati. Match inviato agli admin per revisione.');
    END IF;
END;
$function$;

-- =========================================================================
-- PART 2: Team-aware match finalization with COVER/SPLIT logic
-- =========================================================================

CREATE OR REPLACE FUNCTION public.finalize_team_match(p_match_id uuid, p_winner_side text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        -- COVER: Captain paid all, remove all locked from captain
        UPDATE public.wallets
        SET locked_balance = locked_balance - (v_entry_fee * v_team_size),
            updated_at = now()
        WHERE user_id = v_loser_captain_id AND id IS NOT NULL;
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_captain_id, 'fee', v_entry_fee * v_team_size, p_match_id, 
            'Match perso (Cover All - ' || v_team_size || ' giocatori)', 'completed');
    ELSE
        -- SPLIT: Each member paid individually, remove individual locks
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
        -- COVER: Captain paid all, captain receives all winnings
        -- Remove locked and add prize
        UPDATE public.wallets
        SET balance = balance + v_prize_pool,
            locked_balance = locked_balance - (v_entry_fee * v_team_size),
            updated_at = now()
        WHERE user_id = v_winner_captain_id AND id IS NOT NULL;
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_winner_captain_id, 'payout', v_prize_pool, p_match_id, 
            'Vittoria match (Cover All - Pool: ' || v_total_pool || ' Coins)', 'completed');
    ELSE
        -- SPLIT: Each member paid individually, distribute prize equally
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
                'Vittoria match (Split Pay - quota personale)', 'completed');
        END LOOP;
    END IF;
    
    -- Record platform fee
    INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
    UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now()
    WHERE id IS NOT NULL;
    
    -- Update match status
    UPDATE public.matches 
    SET status = 'completed', finished_at = now() 
    WHERE id = p_match_id;
    
    -- Create/update match result
    INSERT INTO public.match_results (match_id, winner_user_id, winner_team_id, status)
    VALUES (p_match_id, v_winner_captain_id, v_winner_team_id, 'confirmed')
    ON CONFLICT (match_id) DO UPDATE SET 
        winner_user_id = v_winner_captain_id,
        winner_team_id = v_winner_team_id,
        status = 'confirmed',
        updated_at = now();
    
    RETURN json_build_object('success', true, 'status', 'completed', 
        'winner_side', p_winner_side,
        'winner_captain_id', v_winner_captain_id,
        'prize_pool', v_prize_pool);
END;
$function$;

-- =========================================================================
-- PART 3: Fix expire_stale_matches for team refunds (COVER/SPLIT)
-- =========================================================================

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
    v_captain_id UUID;
    v_payment_mode TEXT;
BEGIN
    -- Find all matches that should expire
    FOR v_match IN 
        SELECT m.id, m.creator_id, m.entry_fee, m.team_size, 
               m.payment_mode_host, m.payment_mode_joiner,
               m.team_a_id, m.team_b_id, m.status
        FROM matches m
        WHERE m.status IN ('open', 'ready_check') AND m.expires_at < now()
        FOR UPDATE SKIP LOCKED
    LOOP
        -- ========================================
        -- Refund Team A (Host side)
        -- ========================================
        v_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
        
        IF v_payment_mode = 'cover' THEN
            -- COVER: Only creator locked funds (entry_fee * team_size)
            v_refund_amount := v_match.entry_fee * v_match.team_size;
            
            UPDATE wallets 
            SET balance = balance + v_refund_amount,
                locked_balance = locked_balance - v_refund_amount,
                updated_at = now()
            WHERE user_id = v_match.creator_id AND id IS NOT NULL;
            
            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_match.creator_id, 'refund', v_refund_amount, v_match.id, 
                'Match scaduto - Rimborso (Cover All)', 'completed');
        ELSE
            -- SPLIT: Each Team A member locked individual entry
            FOR v_participant IN
                SELECT mp.user_id FROM match_participants mp
                WHERE mp.match_id = v_match.id AND mp.team_side = 'A'
            LOOP
                UPDATE wallets 
                SET balance = balance + v_match.entry_fee,
                    locked_balance = locked_balance - v_match.entry_fee,
                    updated_at = now()
                WHERE user_id = v_participant.user_id AND id IS NOT NULL;
                
                INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 
                    'Match scaduto - Rimborso (Split Pay)', 'completed');
            END LOOP;
        END IF;
        
        -- ========================================
        -- Refund Team B (Joiner side) if exists
        -- ========================================
        IF v_match.team_b_id IS NOT NULL OR EXISTS (
            SELECT 1 FROM match_participants WHERE match_id = v_match.id AND team_side = 'B'
        ) THEN
            v_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
            
            -- Find Team B captain (first joiner)
            SELECT mp.user_id INTO v_captain_id
            FROM match_participants mp
            WHERE mp.match_id = v_match.id AND mp.team_side = 'B'
            ORDER BY mp.joined_at ASC
            LIMIT 1;
            
            IF v_captain_id IS NOT NULL THEN
                IF v_payment_mode = 'cover' THEN
                    -- COVER: Captain locked all
                    v_refund_amount := v_match.entry_fee * v_match.team_size;
                    
                    UPDATE wallets 
                    SET balance = balance + v_refund_amount,
                        locked_balance = locked_balance - v_refund_amount,
                        updated_at = now()
                    WHERE user_id = v_captain_id AND id IS NOT NULL;
                    
                    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                    VALUES (v_captain_id, 'refund', v_refund_amount, v_match.id, 
                        'Match scaduto - Rimborso (Cover All)', 'completed');
                ELSE
                    -- SPLIT: Each Team B member
                    FOR v_participant IN
                        SELECT mp.user_id FROM match_participants mp
                        WHERE mp.match_id = v_match.id AND mp.team_side = 'B'
                    LOOP
                        UPDATE wallets 
                        SET balance = balance + v_match.entry_fee,
                            locked_balance = locked_balance - v_match.entry_fee,
                            updated_at = now()
                        WHERE user_id = v_participant.user_id AND id IS NOT NULL;
                        
                        INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                        VALUES (v_participant.user_id, 'refund', v_match.entry_fee, v_match.id, 
                            'Match scaduto - Rimborso (Split Pay)', 'completed');
                    END LOOP;
                END IF;
            END IF;
        END IF;
        
        -- Update match status to expired
        UPDATE matches SET status = 'expired', finished_at = now() WHERE id = v_match.id AND id IS NOT NULL;
    END LOOP;
END;
$$;

-- =========================================================================
-- PART 4: One-time cleanup of ghost locks
-- =========================================================================

-- Find and refund users with locked_balance > 0 but no active matches
DO $$
DECLARE
    v_wallet RECORD;
    v_active_lock NUMERIC;
BEGIN
    FOR v_wallet IN
        SELECT w.id, w.user_id, w.locked_balance
        FROM wallets w
        WHERE w.locked_balance > 0
    LOOP
        -- Calculate what should actually be locked
        SELECT COALESCE(SUM(
            CASE 
                WHEN m.payment_mode_host = 'cover' AND mp.team_side = 'A' AND mp.user_id = m.creator_id 
                    THEN m.entry_fee * m.team_size
                WHEN m.payment_mode_joiner = 'cover' AND mp.team_side = 'B' AND mp.user_id = (
                    SELECT user_id FROM match_participants 
                    WHERE match_id = m.id AND team_side = 'B' 
                    ORDER BY joined_at LIMIT 1
                ) THEN m.entry_fee * m.team_size
                WHEN COALESCE(m.payment_mode_host, 'split') = 'split' AND mp.team_side = 'A'
                    THEN m.entry_fee
                WHEN COALESCE(m.payment_mode_joiner, 'split') = 'split' AND mp.team_side = 'B'
                    THEN m.entry_fee
                ELSE 0
            END
        ), 0) INTO v_active_lock
        FROM match_participants mp
        JOIN matches m ON mp.match_id = m.id
        WHERE mp.user_id = v_wallet.user_id
          AND m.status IN ('open', 'ready_check', 'in_progress', 'result_pending');
        
        -- If there's a discrepancy, fix it
        IF v_wallet.locked_balance > v_active_lock THEN
            -- Move excess locked to available
            UPDATE wallets
            SET balance = balance + (v_wallet.locked_balance - v_active_lock),
                locked_balance = v_active_lock,
                updated_at = now()
            WHERE id = v_wallet.id;
            
            -- Log the reconciliation if significant
            IF (v_wallet.locked_balance - v_active_lock) >= 0.01 THEN
                INSERT INTO transactions (user_id, type, amount, description, status)
                VALUES (v_wallet.user_id, 'refund', v_wallet.locked_balance - v_active_lock, 
                    'Riconciliazione wallet - sblocco fondi orfani', 'completed');
            END IF;
        END IF;
    END LOOP;
END $$;

-- =========================================================================
-- PART 5: Update admin_resolve_match_v2 with team-aware logic
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_resolve_match_v2(p_match_id uuid, p_action text, p_notes text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
    v_match RECORD;
    v_participant RECORD;
    v_entry_fee NUMERIC;
    v_team_size INT;
    v_refund_amount NUMERIC;
    v_payment_mode TEXT;
    v_captain_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    IF p_action NOT IN ('refund', 'team_a_wins', 'team_b_wins') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid action. Use: refund, team_a_wins, team_b_wins');
    END IF;
    
    SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    v_entry_fee := v_match.entry_fee;
    v_team_size := v_match.team_size;
    
    IF p_action = 'refund' THEN
        -- Refund all participants based on payment mode
        
        -- Team A refund
        v_payment_mode := COALESCE(v_match.payment_mode_host, 'split');
        IF v_payment_mode = 'cover' THEN
            v_refund_amount := v_entry_fee * v_team_size;
            UPDATE wallets SET balance = balance + v_refund_amount, locked_balance = locked_balance - v_refund_amount, updated_at = now()
            WHERE user_id = v_match.creator_id AND id IS NOT NULL;
            INSERT INTO transactions (user_id, type, amount, match_id, description, status)
            VALUES (v_match.creator_id, 'refund', v_refund_amount, p_match_id, 'Admin refund - ' || COALESCE(p_notes, 'Dispute resolved'), 'completed');
        ELSE
            FOR v_participant IN SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = 'A' LOOP
                UPDATE wallets SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
                WHERE user_id = v_participant.user_id AND id IS NOT NULL;
                INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                VALUES (v_participant.user_id, 'refund', v_entry_fee, p_match_id, 'Admin refund - ' || COALESCE(p_notes, 'Dispute resolved'), 'completed');
            END LOOP;
        END IF;
        
        -- Team B refund
        v_payment_mode := COALESCE(v_match.payment_mode_joiner, 'split');
        SELECT user_id INTO v_captain_id FROM match_participants WHERE match_id = p_match_id AND team_side = 'B' ORDER BY joined_at LIMIT 1;
        IF v_captain_id IS NOT NULL THEN
            IF v_payment_mode = 'cover' THEN
                v_refund_amount := v_entry_fee * v_team_size;
                UPDATE wallets SET balance = balance + v_refund_amount, locked_balance = locked_balance - v_refund_amount, updated_at = now()
                WHERE user_id = v_captain_id AND id IS NOT NULL;
                INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                VALUES (v_captain_id, 'refund', v_refund_amount, p_match_id, 'Admin refund - ' || COALESCE(p_notes, 'Dispute resolved'), 'completed');
            ELSE
                FOR v_participant IN SELECT user_id FROM match_participants WHERE match_id = p_match_id AND team_side = 'B' LOOP
                    UPDATE wallets SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
                    WHERE user_id = v_participant.user_id AND id IS NOT NULL;
                    INSERT INTO transactions (user_id, type, amount, match_id, description, status)
                    VALUES (v_participant.user_id, 'refund', v_entry_fee, p_match_id, 'Admin refund - ' || COALESCE(p_notes, 'Dispute resolved'), 'completed');
                END LOOP;
            END IF;
        END IF;
        
        UPDATE matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;
        UPDATE match_results SET status = 'resolved', admin_notes = p_notes, resolved_by = v_user_id, updated_at = now() WHERE match_id = p_match_id;
        
        RETURN json_build_object('success', true, 'status', 'refunded', 'message', 'All participants refunded');
        
    ELSIF p_action IN ('team_a_wins', 'team_b_wins') THEN
        -- Use finalize_team_match for proper payout
        DECLARE
            v_winner_side TEXT := CASE WHEN p_action = 'team_a_wins' THEN 'A' ELSE 'B' END;
            v_result json;
        BEGIN
            v_result := finalize_team_match(p_match_id, v_winner_side);
            
            -- Update to admin_resolved instead of completed
            UPDATE matches SET status = 'admin_resolved' WHERE id = p_match_id;
            UPDATE match_results SET admin_notes = p_notes, resolved_by = v_user_id WHERE match_id = p_match_id;
            
            RETURN json_build_object('success', true, 'status', 'resolved', 
                'winner_side', v_winner_side, 'message', 'Match resolved by admin');
        END;
    END IF;
    
    RETURN json_build_object('success', false, 'error', 'Unknown action');
END;
$function$;