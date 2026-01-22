-- Add public match details + unified join wrapper + team member listing

-- =========================================================
-- 1) Public match details (for non-participants)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_match_public_details(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match jsonb;
  v_creator jsonb;
  v_participant_count integer;
  v_max_participants integer;
BEGIN
  -- Match row
  SELECT to_jsonb(m.*) INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Creator safe fields
  SELECT to_jsonb(row)
  INTO v_creator
  FROM (
    SELECT p.user_id, p.username, p.avatar_url, p.epic_username
    FROM public.profiles p
    WHERE p.user_id = (v_match->>'creator_id')::uuid
  ) row;

  -- Participant counts only (avoid exposing identities in public view)
  SELECT count(*) INTO v_participant_count
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id;

  v_max_participants := ((v_match->>'team_size')::int) * 2;

  RETURN jsonb_build_object(
    'success', true,
    'match', v_match || jsonb_build_object(
      'creator', v_creator,
      'participants', jsonb_build_array(),
      'participant_count', v_participant_count,
      'max_participants', v_max_participants
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =========================================================
-- 2) Unified join wrapper (single source of truth for UI)
--    - Uses auth.uid() only
--    - Calls existing stable functions
--    - Normalizes response into {success, reason_code, message, ...}
--    - Enforces team join authority: owner only
-- =========================================================
CREATE OR REPLACE FUNCTION public.join_match(
  p_match_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_payment_mode text DEFAULT 'cover'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match public.matches%ROWTYPE;
  v_inner jsonb;
  v_err text;
  v_status text;
  v_reason text;
  v_message text;
  v_is_owner boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'NOT_AUTHENTICATED', 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'MATCH_NOT_FOUND', 'message', 'Match not found');
  END IF;

  -- If this is a team match, require team_id
  IF v_match.team_size > 1 AND p_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'TEAM_REQUIRED', 'message', 'Team is required for this match');
  END IF;

  -- Enforce owner-only authority for team join
  IF v_match.team_size > 1 THEN
    SELECT (t.owner_id = v_user_id) INTO v_is_owner
    FROM public.teams t
    WHERE t.id = p_team_id;

    IF NOT COALESCE(v_is_owner, false) THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'TEAM_OWNER_ONLY', 'message', 'Only the team owner can join this match');
    END IF;
  END IF;

  -- Delegate to existing stable join functions
  IF v_match.team_size = 1 THEN
    SELECT public.join_match_v2(p_match_id) INTO v_inner;
  ELSE
    SELECT public.join_team_match(p_match_id, p_team_id, p_payment_mode) INTO v_inner;
  END IF;

  IF v_inner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'UNKNOWN', 'message', 'Join returned null');
  END IF;

  IF COALESCE((v_inner->>'success')::boolean, false) THEN
    RETURN v_inner || jsonb_build_object('reason_code', 'OK');
  END IF;

  v_err := COALESCE(v_inner->>'error', 'Unknown error');
  v_status := COALESCE(v_inner->>'status', '');

  -- Normalize reason codes (best-effort mapping to stable UI messages)
  v_reason := 'UNKNOWN';

  IF v_status IN ('match_full', 'full') OR v_err ILIKE '%full%' THEN
    v_reason := 'MATCH_FULL';
  ELSIF v_status IN ('match_not_open', 'not_open') OR v_err ILIKE '%not open%' OR v_err ILIKE '%not joinable%' THEN
    v_reason := 'MATCH_NOT_JOINABLE';
  ELSIF v_status IN ('insufficient_balance', 'insufficient_funds') OR v_err ILIKE '%insufficient%' OR v_err ILIKE '%balance%' THEN
    v_reason := 'INSUFFICIENT_BALANCE';
  ELSIF v_status IN ('already_in_match', 'active_match') OR v_err ILIKE '%already%' AND v_err ILIKE '%match%' THEN
    v_reason := 'ALREADY_IN_ACTIVE_MATCH';
  ELSIF v_status IN ('team_invalid', 'team_size_invalid') OR v_err ILIKE '%team%' AND v_err ILIKE '%eligible%' THEN
    v_reason := 'TEAM_INVALID';
  ELSIF v_err ILIKE '%owner%' AND v_err ILIKE '%only%' THEN
    v_reason := 'TEAM_OWNER_ONLY';
  END IF;

  v_message := COALESCE(v_inner->>'message', v_err);

  RETURN v_inner || jsonb_build_object('reason_code', v_reason, 'message', v_message);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason_code', 'EXCEPTION', 'message', SQLERRM);
END;
$$;

-- =========================================================
-- 3) Team members listing (public safe fields only)
--    NOTE: Public member list was requested. This function exposes
--    only non-sensitive profile fields.
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_team_members(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.role, row.created_at), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT
      tm.user_id,
      tm.team_id,
      tm.role,
      tm.status,
      tm.created_at,
      p.username,
      p.avatar_url,
      p.epic_username
    FROM public.team_members tm
    LEFT JOIN public.profiles p
      ON p.user_id = tm.user_id
    WHERE tm.team_id = p_team_id
  ) row;

  RETURN jsonb_build_object('success', true, 'members', v_members);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;