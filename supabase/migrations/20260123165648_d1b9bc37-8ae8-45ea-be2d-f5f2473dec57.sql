BEGIN;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.match_proofs ENABLE ROW LEVEL SECURITY;

-- Additional SELECT policy for admins (safe OR with existing SELECT policies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_proofs'
      AND policyname = 'Admins can view all proofs'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admins can view all proofs"
      ON public.match_proofs
      FOR SELECT
      USING (public.is_admin());
    $p$;
  END IF;
END$$;

COMMIT;