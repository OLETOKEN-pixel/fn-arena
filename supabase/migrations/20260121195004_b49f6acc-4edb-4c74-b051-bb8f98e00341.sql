-- Public leaderboard access without exposing raw match participant data
-- Provide SECURITY DEFINER RPCs that return only aggregated leaderboard rows.

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  wins bigint,
  total_matches bigint,
  total_earnings numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.user_id,
    p.username,
    p.avatar_url,
    count(DISTINCT CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN mr.match_id ELSE NULL END) AS wins,
    count(DISTINCT mp.match_id) AS total_matches,
    COALESCE(sum(CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN m.entry_fee * 1.9 ELSE 0 END), 0) AS total_earnings
  FROM public.profiles_public p
  LEFT JOIN public.match_participants mp ON mp.user_id = p.user_id
  LEFT JOIN public.matches m ON m.id = mp.match_id AND m.status = 'finished'
  LEFT JOIN public.match_results mr ON mr.match_id = m.id
  GROUP BY p.id, p.user_id, p.username, p.avatar_url
  ORDER BY wins DESC, total_earnings DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer, integer) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly(p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  weekly_earned numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.username,
    p.avatar_url,
    COALESCE(
      sum(
        CASE
          WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount
          ELSE 0
        END
      ),
      0
    ) AS weekly_earned
  FROM public.profiles_public p
  LEFT JOIN public.transactions t
    ON t.user_id = p.user_id
   AND t.created_at >= date_trunc('week', now())
   AND t.type = 'payout'
  GROUP BY p.user_id, p.username, p.avatar_url
  HAVING COALESCE(
      sum(
        CASE
          WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount
          ELSE 0
        END
      ),
      0
    ) > 0
  ORDER BY weekly_earned DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_weekly(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_weekly(integer) TO anon, authenticated;


-- Also fix the weekly leaderboard view to be security invoker (linter), even though the app will use the RPC.
CREATE OR REPLACE VIEW public.leaderboard_weekly
WITH (security_invoker=on) AS
  SELECT
    p.user_id,
    p.username,
    p.avatar_url,
    COALESCE(
      sum(
        CASE
          WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount
          ELSE 0
        END
      ),
      0
    ) AS weekly_earned
  FROM public.profiles_public p
  LEFT JOIN public.transactions t
    ON t.user_id = p.user_id
   AND t.created_at >= date_trunc('week', now())
   AND t.type = 'payout'
  GROUP BY p.user_id, p.username, p.avatar_url
  HAVING COALESCE(
      sum(
        CASE
          WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount
          ELSE 0
        END
      ),
      0
    ) > 0
  ORDER BY weekly_earned DESC
  LIMIT 10;

GRANT SELECT ON public.leaderboard_weekly TO anon, authenticated;
