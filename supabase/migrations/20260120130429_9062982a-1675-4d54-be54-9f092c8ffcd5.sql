-- Fix record_challenge_event: pass v_source_uuid (uuid) to update_challenge_progress, not p_source_id (text)

CREATE OR REPLACE FUNCTION public.record_challenge_event(
  p_user_id uuid,
  p_event_type text,
  p_source_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_hash text;
  v_source_uuid uuid;
  v_inserted boolean := false;
BEGIN
  v_event_hash := md5(p_user_id::text || p_event_type || coalesce(p_source_id, ''));

  -- Safe cast: some events may pass non-uuid source ids
  BEGIN
    v_source_uuid := NULLIF(p_source_id, '')::uuid;
  EXCEPTION WHEN others THEN
    v_source_uuid := NULL;
  END;

  INSERT INTO public.challenge_event_log (
    user_id,
    event_type,
    source_id,
    event_hash,
    processed
  )
  VALUES (
    p_user_id,
    p_event_type,
    v_source_uuid,
    v_event_hash,
    false
  )
  ON CONFLICT (event_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    -- FIX: Use v_source_uuid (uuid) instead of p_source_id (text)
    PERFORM public.update_challenge_progress(p_user_id, p_event_type, v_source_uuid);
  END IF;

  RETURN json_build_object(
    'success', true,
    'new_event', v_inserted,
    'event_hash', v_event_hash
  );
END;
$$;