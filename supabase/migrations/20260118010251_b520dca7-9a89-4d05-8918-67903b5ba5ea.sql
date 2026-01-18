-- Create atomic team creation RPC that handles both team and owner member insert
CREATE OR REPLACE FUNCTION public.create_team(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_tag TEXT;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You must be logged in to create a team');
  END IF;

  -- Validate name
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Team name is required');
  END IF;
  
  -- Generate tag from name (first 4 chars, uppercase, no spaces)
  v_tag := UPPER(REGEXP_REPLACE(LEFT(TRIM(p_name), 4), '\s+', '', 'g'));
  IF v_tag = '' THEN
    v_tag := 'TEAM';
  END IF;
  
  -- Create team
  INSERT INTO teams (name, tag, owner_id)
  VALUES (TRIM(p_name), v_tag, auth.uid())
  RETURNING id INTO v_team_id;
  
  -- Add owner as accepted member
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (v_team_id, auth.uid(), 'owner', 'accepted');
  
  RETURN json_build_object('success', true, 'team_id', v_team_id);
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'A team with this name already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;