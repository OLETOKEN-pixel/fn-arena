-- Drop unique constraint on teams.name to allow duplicate team names
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_key;

-- Update create_team RPC: random 5-char tag with retry loop, no name uniqueness check
CREATE OR REPLACE FUNCTION public.create_team(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_tag TEXT;
  v_attempts INT := 0;
  v_max_attempts INT := 5;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You must be logged in to create a team');
  END IF;

  -- Validate name
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Team name is required');
  END IF;
  
  -- Try to create team with random tag (retry on tag collision)
  LOOP
    v_attempts := v_attempts + 1;
    
    -- Generate random 5-char uppercase tag
    v_tag := UPPER(SUBSTRING(md5(gen_random_uuid()::text), 1, 5));
    
    BEGIN
      -- Create team
      INSERT INTO teams (name, tag, owner_id)
      VALUES (TRIM(p_name), v_tag, auth.uid())
      RETURNING id INTO v_team_id;
      
      -- Success - exit loop
      EXIT;
      
    EXCEPTION
      WHEN unique_violation THEN
        -- Only retry if it's a tag collision and we haven't exceeded max attempts
        IF v_attempts >= v_max_attempts THEN
          RETURN json_build_object('success', false, 'error', 'Failed to generate unique team tag. Please try again.');
        END IF;
        -- Continue loop to retry with new tag
    END;
  END LOOP;
  
  -- Add owner as accepted member
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (v_team_id, auth.uid(), 'owner', 'accepted');
  
  RETURN json_build_object('success', true, 'team_id', v_team_id);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;