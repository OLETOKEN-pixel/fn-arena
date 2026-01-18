-- Fix has_active_match to exclude expired matches
-- This ensures expired matches (even with status 'open') don't block users from joining new matches

CREATE OR REPLACE FUNCTION public.has_active_match(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = p_user_id
        AND m.status IN ('open', 'full', 'ready_check', 'in_progress', 'result_pending', 'disputed')
        AND m.expires_at > now()  -- Exclude expired matches
    );
END;
$$;

-- Also fix team_has_active_match to exclude expired matches for consistency
CREATE OR REPLACE FUNCTION public.team_has_active_match(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
BEGIN
    -- Check each accepted team member for active matches
    FOR v_member IN 
        SELECT tm.user_id, p.username
        FROM team_members tm
        JOIN profiles p ON p.user_id = tm.user_id
        WHERE tm.team_id = p_team_id
        AND tm.status = 'accepted'
    LOOP
        IF EXISTS (
            SELECT 1 FROM match_participants mp
            JOIN matches m ON m.id = mp.match_id
            WHERE mp.user_id = v_member.user_id
            AND m.status IN ('open', 'full', 'ready_check', 'in_progress', 'result_pending', 'disputed')
            AND m.expires_at > now()  -- Exclude expired matches
        ) THEN
            RETURN jsonb_build_object('has_active', true, 'username', v_member.username);
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object('has_active', false, 'username', NULL);
END;
$$;

-- Cleanup: expire any stale matches that should have been expired
UPDATE matches
SET status = 'expired'
WHERE status = 'open'
AND expires_at < now();