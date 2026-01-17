-- Fix security warnings by setting search_path on functions

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix handle_new_profile function
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.user_id);
  RETURN NEW;
END;
$$;

-- Fix the leaderboard view - recreate with security_invoker
DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard
WITH (security_invoker = on)
AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.avatar_url,
  COUNT(DISTINCT CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN mr.match_id END) as wins,
  COUNT(DISTINCT mp.match_id) as total_matches,
  COALESCE(SUM(CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN m.entry_fee * 1.9 ELSE 0 END), 0) as total_earnings
FROM public.profiles p
LEFT JOIN public.match_participants mp ON mp.user_id = p.user_id
LEFT JOIN public.matches m ON m.id = mp.match_id AND m.status = 'finished'
LEFT JOIN public.match_results mr ON mr.match_id = m.id
GROUP BY p.id, p.user_id, p.username, p.avatar_url
ORDER BY wins DESC, total_earnings DESC;