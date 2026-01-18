-- Create missing helper function: has_active_match
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
    );
END;
$$;

-- Create missing helper function: team_has_active_match
CREATE OR REPLACE FUNCTION public.team_has_active_match(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
BEGIN
    FOR v_member IN
        SELECT tm.user_id, p.username
        FROM team_members tm
        JOIN profiles p ON p.user_id = tm.user_id
        WHERE tm.team_id = p_team_id AND tm.status = 'accepted'
    LOOP
        IF public.has_active_match(v_member.user_id) THEN
            RETURN jsonb_build_object('has_active', true, 'username', v_member.username);
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object('has_active', false, 'username', null);
END;
$$;

-- Fix match_results status check constraint to allow refunded and admin_resolved statuses
ALTER TABLE public.match_results DROP CONSTRAINT IF EXISTS match_results_status_check;

ALTER TABLE public.match_results ADD CONSTRAINT match_results_status_check 
CHECK (status IN ('pending', 'confirmed', 'disputed', 'resolved', 'refunded', 'admin_resolved'));