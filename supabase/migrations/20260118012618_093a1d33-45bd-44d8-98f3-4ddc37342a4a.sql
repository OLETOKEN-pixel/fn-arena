-- Create RPC function for team owner to delete their team
CREATE OR REPLACE FUNCTION public.delete_team(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Verify ownership
  SELECT owner_id INTO v_owner_id FROM public.teams WHERE id = p_team_id;
  
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;
  
  IF v_owner_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can delete this team');
  END IF;
  
  -- Delete team members first (foreign key constraint)
  DELETE FROM public.team_members WHERE team_id = p_team_id;
  
  -- Delete the team
  DELETE FROM public.teams WHERE id = p_team_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;