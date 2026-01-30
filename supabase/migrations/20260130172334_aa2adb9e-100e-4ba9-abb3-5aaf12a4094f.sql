-- Drop and recreate get_leaderboard with correct ordering
DROP FUNCTION IF EXISTS public.get_leaderboard(integer, integer);

-- Fix get_leaderboard ordering: primary by total_earnings DESC, then wins DESC
CREATE FUNCTION public.get_leaderboard(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  total_matches bigint,
  wins bigint,
  total_earnings numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    lb.id,
    lb.user_id,
    lb.username,
    lb.avatar_url,
    lb.total_matches,
    lb.wins,
    lb.total_earnings
  FROM leaderboard lb
  ORDER BY lb.total_earnings DESC, lb.wins DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- RPC: get_player_rank - Get a single player's global rank
CREATE OR REPLACE FUNCTION public.get_player_rank(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rank FROM (
    SELECT 
      user_id,
      ROW_NUMBER() OVER (ORDER BY total_earnings DESC, wins DESC) AS rank
    FROM leaderboard
    WHERE user_id IS NOT NULL
  ) ranked
  WHERE ranked.user_id = p_user_id;
$$;