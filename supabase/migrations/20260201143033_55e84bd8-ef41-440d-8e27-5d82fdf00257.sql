-- =====================================================
-- Fix join_match_v2 ambiguity: Drop old 1-arg version
-- =====================================================
-- The old join_match_v2(uuid) conflicts with the new
-- join_match_v2(uuid, uuid DEFAULT NULL, text DEFAULT 'cover')
-- because both match a call with just 1 uuid argument.
--
-- Solution: Drop the old version, keep only the new one.

DROP FUNCTION IF EXISTS public.join_match_v2(uuid);