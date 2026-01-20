-- =====================================================
-- FIX: Remove duplicate triggers on match_proofs
-- ROOT CAUSE: Two triggers (on_proof_insert, on_proof_insert_challenge) 
-- both call handle_proof_challenge_event, causing duplicate event_hash 
-- constraint violation and rolling back the entire proof insert
-- =====================================================

-- Step 1: Drop ALL existing triggers on match_proofs to start clean
DROP TRIGGER IF EXISTS on_proof_insert ON public.match_proofs;
DROP TRIGGER IF EXISTS on_proof_insert_challenge ON public.match_proofs;
DROP TRIGGER IF EXISTS trigger_proof_challenge ON public.match_proofs;

-- Step 2: Make record_challenge_event "race-safe" using ON CONFLICT DO NOTHING
-- This ensures that even if called multiple times, it won't crash
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
  v_challenge_id uuid;
  v_inserted boolean := false;
BEGIN
  -- Generate unique event hash
  v_event_hash := md5(p_user_id::text || p_event_type || p_source_id);
  
  -- Try to insert the event - ON CONFLICT means duplicate = no-op (idempotent)
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
    p_source_id,
    v_event_hash,
    false
  )
  ON CONFLICT (event_hash) DO NOTHING;
  
  -- Check if we actually inserted (GET DIAGNOSTICS would work too)
  -- If row was inserted, ROW_COUNT = 1; if conflict, ROW_COUNT = 0
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  -- Only update challenge progress if this is a NEW event
  IF v_inserted THEN
    PERFORM public.update_challenge_progress(p_user_id, p_event_type, p_source_id);
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'new_event', v_inserted,
    'event_hash', v_event_hash
  );
END;
$$;

-- Step 3: Recreate SINGLE canonical trigger for challenge events on proof insert
CREATE OR REPLACE FUNCTION public.handle_proof_challenge_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Record the proof_uploaded event for challenge tracking
  PERFORM public.record_challenge_event(
    NEW.user_id,
    'proof_uploaded',
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- Create exactly ONE trigger
CREATE TRIGGER on_proof_insert
  AFTER INSERT ON public.match_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_proof_challenge_event();

-- Step 4: Expand storage policy to allow uploads in ALL active match states
-- First drop any existing restrictive policies
DROP POLICY IF EXISTS "Match participants can upload proof files" ON storage.objects;

-- Recreate with expanded state list
CREATE POLICY "Match participants can upload proof files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proofs'
  AND EXISTS (
    SELECT 1 FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    WHERE mp.user_id = auth.uid()
    AND mp.match_id = (storage.foldername(name))[1]::uuid
    AND m.status IN (
      'open', 'joined', 'ready_check', 'full', 'started', 
      'in_progress', 'result_pending', 'disputed', 
      'completed', 'finished', 'admin_resolved'
    )
  )
);