-- Drop existing admin_global_search function first (needed due to return type change)
DROP FUNCTION IF EXISTS public.admin_global_search(TEXT);

-- Update admin_global_search to use escaped patterns
CREATE OR REPLACE FUNCTION public.admin_global_search(p_query TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_escaped_query TEXT;
BEGIN
  -- Check admin permission
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  -- Validate input length
  IF LENGTH(p_query) < 2 THEN
    RETURN json_build_object('users', '[]'::json, 'matches', '[]'::json, 'transactions', '[]'::json);
  END IF;
  
  IF LENGTH(p_query) > 100 THEN
    RAISE EXCEPTION 'Search term too long';
  END IF;
  
  -- Escape LIKE wildcards to prevent pattern injection
  v_escaped_query := escape_like_pattern(p_query);
  
  SELECT json_build_object(
    'users', (
      SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json)
      FROM (
        SELECT 
          id,
          user_id,
          username,
          email,
          avatar_url,
          is_banned
        FROM profiles
        WHERE 
          username ILIKE '%' || v_escaped_query || '%'
          OR email ILIKE '%' || v_escaped_query || '%'
        LIMIT 5
      ) u
    ),
    'matches', (
      SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
      FROM (
        SELECT 
          m.id,
          m.mode,
          m.region,
          m.status,
          m.entry_fee,
          m.team_size,
          p.username as creator_username,
          m.created_at
        FROM matches m
        LEFT JOIN profiles p ON m.creator_id = p.user_id
        WHERE 
          m.id::text ILIKE '%' || v_escaped_query || '%'
          OR m.mode ILIKE '%' || v_escaped_query || '%'
          OR p.username ILIKE '%' || v_escaped_query || '%'
        ORDER BY m.created_at DESC
        LIMIT 5
      ) m
    ),
    'transactions', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          t.id,
          t.type,
          t.amount,
          t.description,
          t.match_id,
          t.user_id,
          t.created_at
        FROM transactions t
        WHERE 
          t.id::text ILIKE '%' || v_escaped_query || '%'
          OR t.type ILIKE '%' || v_escaped_query || '%'
          OR t.description ILIKE '%' || v_escaped_query || '%'
        ORDER BY t.created_at DESC
        LIMIT 5
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;