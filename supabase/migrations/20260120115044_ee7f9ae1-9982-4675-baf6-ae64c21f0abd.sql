
-- =====================================================
-- FIX CRITICAL ISSUES: Storage + Challenges Progress Cap
-- =====================================================

-- 1. Fix storage policy for proofs bucket (more permissive)
DROP POLICY IF EXISTS "Match participants can upload proof files" ON storage.objects;

CREATE POLICY "Match participants can upload proof files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'proofs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id
        WHERE mp.user_id = auth.uid()
        AND mp.match_id::text = split_part(name, '/', 1)
        AND m.status IN ('in_progress', 'result_pending', 'ready_check', 'full', 'started', 'disputed')
    )
);

-- 2. Fix update_challenge_progress to CAP progress at target_value
CREATE OR REPLACE FUNCTION public.update_challenge_progress(
    p_user_id UUID, 
    p_metric_type TEXT, 
    p_source_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_period_key TEXT;
  v_progress RECORD;
BEGIN
  -- Find all active challenges matching this metric
  FOR v_challenge IN 
    SELECT * FROM challenges 
    WHERE metric_type = p_metric_type 
    AND is_active = true
  LOOP
    -- Get correct period key
    v_period_key := get_current_period_key(v_challenge.type);
    
    -- Upsert progress with CAP at target_value
    INSERT INTO user_challenge_progress (user_id, challenge_id, period_key, progress_value)
    VALUES (p_user_id, v_challenge.id, v_period_key, 1)
    ON CONFLICT (user_id, challenge_id, period_key)
    DO UPDATE SET 
      progress_value = LEAST(user_challenge_progress.progress_value + 1, v_challenge.target_value),
      updated_at = now();
    
    -- Check if now completed
    SELECT * INTO v_progress 
    FROM user_challenge_progress 
    WHERE user_id = p_user_id 
    AND challenge_id = v_challenge.id 
    AND period_key = v_period_key;
    
    IF v_progress.progress_value >= v_challenge.target_value AND NOT COALESCE(v_progress.is_completed, false) THEN
      UPDATE user_challenge_progress 
      SET is_completed = true, completed_at = now()
      WHERE id = v_progress.id;
    END IF;
  END LOOP;
END;
$$;

-- 3. Fix any existing progress that exceeded target (cleanup)
UPDATE user_challenge_progress ucp
SET progress_value = c.target_value
FROM challenges c
WHERE ucp.challenge_id = c.id
AND ucp.progress_value > c.target_value;
