-- Tighten RLS on challenge system + notifications tables to prevent direct client tampering

-- 1) user_challenge_progress: keep read-own; remove permissive "system" mutation policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_challenge_progress' AND policyname='System can insert progress'
  ) THEN
    EXECUTE 'DROP POLICY "System can insert progress" ON public.user_challenge_progress';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_challenge_progress' AND policyname='System can update progress'
  ) THEN
    EXECUTE 'DROP POLICY "System can update progress" ON public.user_challenge_progress';
  END IF;
END $$;

-- (No INSERT/UPDATE/DELETE policies added here on purpose:
-- all writes must go through SECURITY DEFINER RPCs.)


-- 2) user_xp: remove permissive mutation policy; keep existing SELECT policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_xp' AND policyname='System can manage XP'
  ) THEN
    EXECUTE 'DROP POLICY "System can manage XP" ON public.user_xp';
  END IF;
END $$;

-- (No INSERT/UPDATE/DELETE policies added here on purpose.)


-- 3) challenge_event_log: block direct access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_event_log' AND policyname='System can manage event log'
  ) THEN
    EXECUTE 'DROP POLICY "System can manage event log" ON public.challenge_event_log';
  END IF;
END $$;

-- Explicitly deny direct SELECT (and therefore ALL direct access)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_event_log' AND policyname='No direct access to event log'
  ) THEN
    EXECUTE 'CREATE POLICY "No direct access to event log" ON public.challenge_event_log FOR SELECT USING (false)';
  END IF;
END $$;


-- 4) challenge_anti_abuse: block direct access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_anti_abuse' AND policyname='System can manage anti-abuse'
  ) THEN
    EXECUTE 'DROP POLICY "System can manage anti-abuse" ON public.challenge_anti_abuse';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_anti_abuse' AND policyname='No direct access to anti-abuse'
  ) THEN
    EXECUTE 'CREATE POLICY "No direct access to anti-abuse" ON public.challenge_anti_abuse FOR SELECT USING (false)';
  END IF;
END $$;


-- 5) notifications: remove permissive insert, allow insert only for self, keep existing read/update-own
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND policyname='System can insert notifications'
  ) THEN
    EXECUTE 'DROP POLICY "System can insert notifications" ON public.notifications';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can insert own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;
