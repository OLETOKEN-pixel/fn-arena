-- Fix 1: prevent authenticated users from reading all profile rows with sensitive fields
DO $$
BEGIN
  -- Drop overly broad policy if present
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Authenticated can view public profile data'
  ) THEN
    EXECUTE 'DROP POLICY "Authenticated can view public profile data" ON public.profiles';
  END IF;
END $$;

-- Re-create the safe public profile view (no email/paypal/iban) as SECURITY INVOKER
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
  SELECT
    p.id,
    p.user_id,
    p.username,
    p.avatar_url,
    p.epic_username,
    p.preferred_region,
    p.preferred_platform,
    p.created_at
  FROM public.profiles p;

-- Ensure the API roles can read the safe view
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Fix 2: restrict match participant data visibility and avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_match_participant(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_match_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_participant(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_participants'
      AND policyname = 'Participants viewable by all'
  ) THEN
    EXECUTE 'DROP POLICY "Participants viewable by all" ON public.match_participants';
  END IF;
END $$;

CREATE POLICY "Participants and admins can view match participants"
ON public.match_participants
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.is_match_participant(match_participants.match_id, auth.uid())
);
