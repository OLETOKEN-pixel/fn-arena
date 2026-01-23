-- Fix linter: make the view explicitly SECURITY INVOKER
DROP VIEW IF EXISTS public.match_chat_messages_view;

CREATE VIEW public.match_chat_messages_view
WITH (security_invoker = true)
AS
SELECT
  m.id,
  m.match_id,
  m.user_id,
  m.message,
  m.is_system,
  m.created_at,
  CASE
    WHEN public.has_role(m.user_id, 'admin'::public.app_role) THEN 'ADMIN'
    ELSE COALESCE(p.username, 'Unknown')
  END AS display_name,
  p.avatar_url
FROM public.match_chat_messages m
LEFT JOIN public.profiles_public p
  ON p.user_id = m.user_id;