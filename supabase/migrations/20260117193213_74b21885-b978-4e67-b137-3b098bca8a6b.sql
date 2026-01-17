-- =============================================
-- OLEBOY TOKEN - Complete Match System Migration
-- =============================================

-- 1. Add new columns to match_participants
ALTER TABLE public.match_participants 
ADD COLUMN IF NOT EXISTS team_side TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS result_choice TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS result_at TIMESTAMPTZ DEFAULT NULL;

-- Add constraints for team_side and result_choice
ALTER TABLE public.match_participants 
DROP CONSTRAINT IF EXISTS match_participants_team_side_check,
DROP CONSTRAINT IF EXISTS match_participants_result_choice_check;

ALTER TABLE public.match_participants 
ADD CONSTRAINT match_participants_team_side_check CHECK (team_side IN ('A', 'B')),
ADD CONSTRAINT match_participants_result_choice_check CHECK (result_choice IN ('WIN', 'LOSS'));

-- 2. Update matches status constraint to support new states
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check 
CHECK (status IN ('open', 'joined', 'ready_check', 'in_progress', 'result_pending', 'completed', 'disputed', 'canceled', 'admin_resolved', 'expired', 'finished', 'full', 'started'));

-- 3. Create join_match_v2 function
CREATE OR REPLACE FUNCTION public.join_match_v2(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_current_balance DECIMAL(10,2);
    v_existing_participant RECORD;
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
    
    IF v_match.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Match is not open');
    END IF;
    
    IF v_match.creator_id = v_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot join your own match');
    END IF;
    
    -- Check if already participant
    SELECT * INTO v_existing_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    IF v_existing_participant IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Already a participant');
    END IF;
    
    -- Check wallet balance
    SELECT balance INTO v_current_balance
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;
    
    IF v_current_balance < v_match.entry_fee THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
    
    -- Lock funds
    UPDATE public.wallets
    SET 
        balance = balance - v_match.entry_fee,
        locked_balance = locked_balance + v_match.entry_fee,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    -- Log transaction
    INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_user_id, 'lock', v_match.entry_fee, p_match_id, 'Locked funds for match join', 'completed');
    
    -- Add as participant with team_side B
    INSERT INTO public.match_participants (match_id, user_id, team_side, status)
    VALUES (p_match_id, v_user_id, 'B', 'joined');
    
    -- Update host to team_side A if not set
    UPDATE public.match_participants
    SET team_side = 'A'
    WHERE match_id = p_match_id AND user_id = v_match.creator_id AND team_side IS NULL;
    
    -- Update match status to ready_check
    UPDATE public.matches
    SET status = 'ready_check'
    WHERE id = p_match_id;
    
    RETURN json_build_object('success', true, 'status', 'ready_check');
END;
$$;

-- 4. Create set_player_ready function
CREATE OR REPLACE FUNCTION public.set_player_ready(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_participant RECORD;
    v_all_ready BOOLEAN;
    v_total_participants INT;
    v_ready_count INT;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get match
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
    
    -- Check if participant
    SELECT * INTO v_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id
    FOR UPDATE;
    
    IF v_participant IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    IF v_participant.ready = TRUE THEN
        RETURN json_build_object('success', false, 'error', 'Already ready');
    END IF;
    
    -- Set ready
    UPDATE public.match_participants
    SET ready = TRUE, ready_at = now()
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    -- Check if all participants are ready
    SELECT COUNT(*), COUNT(*) FILTER (WHERE ready = TRUE)
    INTO v_total_participants, v_ready_count
    FROM public.match_participants
    WHERE match_id = p_match_id;
    
    -- Add 1 for the current user who just became ready
    v_ready_count := v_ready_count + 1;
    
    IF v_ready_count >= v_total_participants THEN
        -- All ready, start match
        UPDATE public.matches
        SET status = 'in_progress', started_at = now()
        WHERE id = p_match_id;
        
        RETURN json_build_object('success', true, 'status', 'in_progress', 'all_ready', true);
    END IF;
    
    RETURN json_build_object('success', true, 'status', 'ready_check', 'ready_count', v_ready_count, 'total', v_total_participants);
END;
$$;

-- 5. Create submit_match_result function
CREATE OR REPLACE FUNCTION public.submit_match_result(p_match_id UUID, p_result TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        
        -- Record platform fee
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now();
        
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
        
        -- Record platform fee
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now();
        
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
$$;

-- 6. Create cancel_match_v2 function
CREATE OR REPLACE FUNCTION public.cancel_match_v2(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_match RECORD;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get match
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.creator_id != v_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Only the host can cancel');
    END IF;
    
    IF v_match.status != 'open' THEN
        RETURN json_build_object('success', false, 'error', 'Can only cancel open matches');
    END IF;
    
    -- Refund host
    UPDATE public.wallets
    SET balance = balance + v_match.entry_fee, locked_balance = locked_balance - v_match.entry_fee, updated_at = now()
    WHERE user_id = v_user_id;
    
    -- Log refund
    INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_user_id, 'refund', v_match.entry_fee, p_match_id, 'Match canceled - refund', 'completed');
    
    -- Update match status
    UPDATE public.matches SET status = 'canceled' WHERE id = p_match_id;
    
    RETURN json_build_object('success', true);
END;
$$;

-- 7. Create leave_match function
CREATE OR REPLACE FUNCTION public.leave_match(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_match RECORD;
    v_participant RECORD;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get match
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status != 'ready_check' THEN
        RETURN json_build_object('success', false, 'error', 'Can only leave during ready check phase');
    END IF;
    
    IF v_match.creator_id = v_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Host cannot leave. Cancel the match instead.');
    END IF;
    
    -- Check if participant
    SELECT * INTO v_participant
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = v_user_id;
    
    IF v_participant IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a participant');
    END IF;
    
    IF v_participant.ready = TRUE THEN
        RETURN json_build_object('success', false, 'error', 'Cannot leave after ready');
    END IF;
    
    -- Refund joiner
    UPDATE public.wallets
    SET balance = balance + v_match.entry_fee, locked_balance = locked_balance - v_match.entry_fee, updated_at = now()
    WHERE user_id = v_user_id;
    
    -- Log refund
    INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
    VALUES (v_user_id, 'refund', v_match.entry_fee, p_match_id, 'Left match - refund', 'completed');
    
    -- Remove participant
    DELETE FROM public.match_participants WHERE match_id = p_match_id AND user_id = v_user_id;
    
    -- Reset host ready status and match to open
    UPDATE public.match_participants SET ready = FALSE, ready_at = NULL WHERE match_id = p_match_id;
    UPDATE public.matches SET status = 'open' WHERE id = p_match_id;
    
    RETURN json_build_object('success', true);
END;
$$;

-- 8. Create admin_resolve_match_v2 function
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
    v_team_a_user UUID;
    v_team_b_user UUID;
    v_winner_user_id UUID;
    v_loser_user_id UUID;
    v_entry_fee DECIMAL(10,2);
    v_prize_pool DECIMAL(10,2);
    v_platform_fee DECIMAL(10,2);
    v_winner_payout DECIMAL(10,2);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    IF p_action NOT IN ('TEAM_A_WIN', 'TEAM_B_WIN', 'REFUND_BOTH') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid action');
    END IF;
    
    -- Get match
    SELECT * INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;
    
    IF v_match IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;
    
    IF v_match.status NOT IN ('disputed', 'ready_check', 'in_progress', 'result_pending') THEN
        RETURN json_build_object('success', false, 'error', 'Match cannot be resolved');
    END IF;
    
    -- Get participants
    SELECT user_id INTO v_team_a_user FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'A' LIMIT 1;
    SELECT user_id INTO v_team_b_user FROM public.match_participants WHERE match_id = p_match_id AND team_side = 'B' LIMIT 1;
    
    v_entry_fee := v_match.entry_fee;
    v_prize_pool := v_entry_fee * 2;
    v_platform_fee := v_prize_pool * 0.05;
    v_winner_payout := v_prize_pool - v_platform_fee;
    
    IF p_action = 'REFUND_BOTH' THEN
        -- Refund both players
        UPDATE public.wallets
        SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_team_a_user;
        
        UPDATE public.wallets
        SET balance = balance + v_entry_fee, locked_balance = locked_balance - v_entry_fee, updated_at = now()
        WHERE user_id = v_team_b_user;
        
        -- Log refunds
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_team_a_user, 'refund', v_entry_fee, p_match_id, 'Admin resolved - refund', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_team_b_user, 'refund', v_entry_fee, p_match_id, 'Admin resolved - refund', 'completed');
        
        -- Update match and result
        UPDATE public.matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;
        
        INSERT INTO public.match_results (match_id, status, admin_notes, resolved_by)
        VALUES (p_match_id, 'resolved', p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET status = 'resolved', admin_notes = p_notes, resolved_by = auth.uid(), updated_at = now();
        
        RETURN json_build_object('success', true, 'action', 'refund_both');
    ELSE
        -- Assign winner
        IF p_action = 'TEAM_A_WIN' THEN
            v_winner_user_id := v_team_a_user;
            v_loser_user_id := v_team_b_user;
        ELSE
            v_winner_user_id := v_team_b_user;
            v_loser_user_id := v_team_a_user;
        END IF;
        
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
        VALUES (v_winner_user_id, 'payout', v_winner_payout, p_match_id, 'Admin resolved - winnings', 'completed');
        
        INSERT INTO public.transactions (user_id, type, amount, match_id, description, status)
        VALUES (v_loser_user_id, 'fee', v_entry_fee, p_match_id, 'Admin resolved - loss', 'completed');
        
        -- Record platform fee
        INSERT INTO public.platform_earnings (match_id, amount) VALUES (p_match_id, v_platform_fee);
        UPDATE public.platform_wallet SET balance = balance + v_platform_fee, updated_at = now();
        
        -- Update match and result
        UPDATE public.matches SET status = 'admin_resolved', finished_at = now() WHERE id = p_match_id;
        
        INSERT INTO public.match_results (match_id, winner_user_id, status, admin_notes, resolved_by)
        VALUES (p_match_id, v_winner_user_id, 'resolved', p_notes, auth.uid())
        ON CONFLICT (match_id) DO UPDATE SET winner_user_id = v_winner_user_id, status = 'resolved', admin_notes = p_notes, resolved_by = auth.uid(), updated_at = now();
        
        RETURN json_build_object('success', true, 'action', p_action, 'winner', v_winner_user_id);
    END IF;
END;
$$;

-- 9. Add unique constraint on match_results if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'match_results_match_id_key'
    ) THEN
        ALTER TABLE public.match_results ADD CONSTRAINT match_results_match_id_key UNIQUE (match_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;