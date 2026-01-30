-- 1. Create search_players_public RPC (missing)
CREATE OR REPLACE FUNCTION public.search_players_public(
  p_query text,
  p_current_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pp.user_id,
    pp.username,
    pp.avatar_url,
    COALESCE(
      (SELECT r.rn FROM (
        SELECT lb.user_id, ROW_NUMBER() OVER (ORDER BY lb.total_earnings DESC, lb.wins DESC) as rn
        FROM leaderboard lb
      ) r WHERE r.user_id = pp.user_id),
      999999
    )::bigint as rank
  FROM profiles_public pp
  WHERE 
    pp.username ILIKE '%' || p_query || '%'
    AND (p_current_user_id IS NULL OR pp.user_id != p_current_user_id)
  ORDER BY 
    CASE WHEN LOWER(pp.username) = LOWER(p_query) THEN 0 ELSE 1 END,
    LENGTH(pp.username)
  LIMIT p_limit;
$$;

-- 2. Create get_player_rank RPC (for compare modal)
CREATE OR REPLACE FUNCTION public.get_player_rank(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT r.rn FROM (
      SELECT lb.user_id, ROW_NUMBER() OVER (ORDER BY lb.total_earnings DESC, lb.wins DESC) as rn
      FROM leaderboard lb
    ) r WHERE r.user_id = p_user_id),
    999999
  )::bigint;
$$;

-- 3. Recreate leaderboard view with correct ordering (total_earnings first, then wins)
DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.avatar_url,
  COALESCE(w.wins, 0) as wins,
  COALESCE(tm.total_matches, 0) as total_matches,
  COALESCE(te.total_earnings, 0) as total_earnings
FROM profiles p
LEFT JOIN (
  SELECT mr.winner_user_id as user_id, COUNT(*) as wins
  FROM match_results mr
  WHERE mr.status = 'confirmed' AND mr.winner_user_id IS NOT NULL
  GROUP BY mr.winner_user_id
) w ON w.user_id = p.user_id
LEFT JOIN (
  SELECT mp.user_id, COUNT(DISTINCT mp.match_id) as total_matches
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id AND m.status = 'finished'
  GROUP BY mp.user_id
) tm ON tm.user_id = p.user_id
LEFT JOIN (
  SELECT mr.winner_user_id as user_id, SUM(m.entry_fee * 1.9) as total_earnings
  FROM match_results mr
  JOIN matches m ON m.id = mr.match_id
  WHERE mr.status = 'confirmed' AND mr.winner_user_id IS NOT NULL
  GROUP BY mr.winner_user_id
) te ON te.user_id = p.user_id
ORDER BY total_earnings DESC, wins DESC;

-- 4. Function to generate unique username (for Discord bug fix)
CREATE OR REPLACE FUNCTION public.generate_unique_username(base_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name text;
  candidate text;
  counter int := 0;
BEGIN
  -- Clean the base name: lowercase, alphanumeric and underscore only
  clean_name := regexp_replace(LOWER(base_name), '[^a-z0-9_]', '', 'g');
  IF LENGTH(clean_name) < 3 THEN
    clean_name := 'player';
  END IF;
  
  candidate := clean_name;
  
  WHILE EXISTS (SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(candidate)) LOOP
    counter := counter + 1;
    candidate := clean_name || counter::text;
  END LOOP;
  
  RETURN candidate;
END;
$$;