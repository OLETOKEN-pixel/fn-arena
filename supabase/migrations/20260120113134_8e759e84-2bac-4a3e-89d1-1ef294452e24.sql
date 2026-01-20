
-- =====================================================
-- FIX CHALLENGES SYSTEM - COMPLETE OVERHAUL
-- =====================================================

-- 1. Create the MISSING trigger for proof uploads
CREATE OR REPLACE FUNCTION public.handle_proof_challenge_event()
RETURNS TRIGGER AS $$
DECLARE
    v_match RECORD;
BEGIN
    SELECT status INTO v_match FROM public.matches WHERE id = NEW.match_id;
    
    IF v_match.status IS NOT NULL AND v_match.status IN (
        'in_progress', 'result_pending', 'completed', 'finished', 
        'admin_resolved', 'disputed', 'started', 'full', 'ready_check'
    ) THEN
        PERFORM public.record_challenge_event(NEW.user_id, 'proof_uploaded', NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_proof_insert ON public.match_proofs;
CREATE TRIGGER on_proof_insert
    AFTER INSERT ON public.match_proofs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_proof_challenge_event();

-- 2. Drop and recreate submit_match_result with challenge events
DROP FUNCTION IF EXISTS public.submit_match_result(UUID, TEXT);

CREATE FUNCTION public.submit_match_result(p_match_id UUID, p_result TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match RECORD;
    v_participant RECORD;
    v_opponent RECORD;
    v_caller_id UUID;
    v_winner_id UUID;
    v_loser_id UUID;
    v_entry_fee NUMERIC;
    v_prize_pool NUMERIC;
    v_platform_cut NUMERIC;
    v_winner_payout NUMERIC;
    v_all_participant RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Match not found');
    END IF;

    IF v_match.status NOT IN ('in_progress', 'started', 'full', 'ready_check', 'result_pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Match is not in progress');
    END IF;

    SELECT * INTO v_participant 
    FROM match_participants 
    WHERE match_id = p_match_id AND user_id = v_caller_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not a participant');
    END IF;

    IF v_participant.result_choice IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You already submitted a result');
    END IF;

    UPDATE match_participants 
    SET result_choice = p_result, result_at = now()
    WHERE id = v_participant.id;

    SELECT * INTO v_opponent 
    FROM match_participants 
    WHERE match_id = p_match_id AND user_id != v_caller_id
    LIMIT 1;

    IF v_opponent.result_choice IS NULL THEN
        UPDATE matches SET status = 'result_pending' WHERE id = p_match_id;
        RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Waiting for opponent result');
    END IF;

    v_entry_fee := v_match.entry_fee;
    v_prize_pool := v_entry_fee * 2;
    v_platform_cut := v_prize_pool * 0.10;
    v_winner_payout := v_prize_pool - v_platform_cut;

    IF (p_result = 'WIN' AND v_opponent.result_choice = 'LOSS') THEN
        v_winner_id := v_caller_id;
        v_loser_id := v_opponent.user_id;
    ELSIF (p_result = 'LOSS' AND v_opponent.result_choice = 'WIN') THEN
        v_winner_id := v_opponent.user_id;
        v_loser_id := v_caller_id;
    ELSE
        UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
        
        INSERT INTO match_results (match_id, status, dispute_reason)
        VALUES (p_match_id, 'disputed', 'Both players submitted conflicting results')
        ON CONFLICT (match_id) DO UPDATE SET 
            status = 'disputed',
            dispute_reason = 'Both players submitted conflicting results',
            updated_at = now();
        
        RETURN jsonb_build_object('success', true, 'status', 'disputed', 'message', 'Results conflict - dispute created');
    END IF;

    UPDATE wallets SET 
        locked_balance = COALESCE(locked_balance, 0) - v_entry_fee,
        updated_at = now()
    WHERE user_id IN (v_winner_id, v_loser_id);

    UPDATE wallets SET 
        balance = COALESCE(balance, 0) + v_winner_payout,
        updated_at = now()
    WHERE user_id = v_winner_id;

    INSERT INTO transactions (user_id, type, amount, match_id, description)
    VALUES 
        (v_winner_id, 'unlock', v_entry_fee, p_match_id, 'Entry fee unlocked'),
        (v_loser_id, 'unlock', v_entry_fee, p_match_id, 'Entry fee unlocked'),
        (v_winner_id, 'payout', v_winner_payout, p_match_id, 'Match winnings'),
        (v_loser_id, 'fee', -v_entry_fee, p_match_id, 'Match loss');

    PERFORM record_platform_fee(p_match_id, v_platform_cut);

    UPDATE matches SET 
        status = 'finished',
        finished_at = now()
    WHERE id = p_match_id;

    INSERT INTO match_results (match_id, winner_user_id, status)
    VALUES (p_match_id, v_winner_id, 'confirmed')
    ON CONFLICT (match_id) DO UPDATE SET 
        winner_user_id = v_winner_id,
        status = 'confirmed',
        updated_at = now();

    -- CRITICAL: Register challenge events for ALL participants
    FOR v_all_participant IN 
        SELECT user_id FROM match_participants WHERE match_id = p_match_id
    LOOP
        PERFORM record_challenge_event(v_all_participant.user_id, 'match_completed', p_match_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'status', 'completed',
        'winner_id', v_winner_id,
        'payout', v_winner_payout
    );
END;
$$;

-- 3. Create admin backfill function
CREATE OR REPLACE FUNCTION public.admin_backfill_challenge_progress(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_daily_key TEXT;
    v_weekly_key TEXT;
    v_match RECORD;
    v_proof RECORD;
    v_ready RECORD;
    v_count_matches INT := 0;
    v_count_proofs INT := 0;
    v_count_ready INT := 0;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin only');
    END IF;

    v_daily_key := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
    v_weekly_key := to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
    
    FOR v_match IN 
        SELECT DISTINCT m.id 
        FROM matches m
        JOIN match_participants mp ON mp.match_id = m.id
        WHERE mp.user_id = p_user_id
        AND m.status IN ('finished', 'completed', 'admin_resolved')
        AND m.finished_at IS NOT NULL
        AND DATE(m.finished_at AT TIME ZONE 'UTC') = DATE(now() AT TIME ZONE 'UTC')
    LOOP
        PERFORM record_challenge_event(p_user_id, 'match_completed', v_match.id);
        v_count_matches := v_count_matches + 1;
    END LOOP;
    
    FOR v_proof IN
        SELECT mp.id
        FROM match_proofs mp
        WHERE mp.user_id = p_user_id
        AND DATE(mp.created_at AT TIME ZONE 'UTC') = DATE(now() AT TIME ZONE 'UTC')
    LOOP
        PERFORM record_challenge_event(p_user_id, 'proof_uploaded', v_proof.id);
        v_count_proofs := v_count_proofs + 1;
    END LOOP;
    
    FOR v_ready IN
        SELECT mp.id, mp.match_id
        FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = p_user_id
        AND mp.ready = true
        AND mp.ready_at IS NOT NULL
        AND mp.joined_at IS NOT NULL
        AND (mp.ready_at - mp.joined_at) <= INTERVAL '2 minutes'
        AND DATE(mp.ready_at AT TIME ZONE 'UTC') = DATE(now() AT TIME ZONE 'UTC')
    LOOP
        PERFORM record_challenge_event(p_user_id, 'ready_up_fast', v_ready.match_id);
        v_count_ready := v_count_ready + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'matches_processed', v_count_matches,
        'proofs_processed', v_count_proofs,
        'ready_processed', v_count_ready,
        'daily_key', v_daily_key,
        'weekly_key', v_weekly_key
    );
END;
$$;

-- 4. Ensure realtime is enabled
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_challenge_progress;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_xp;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
