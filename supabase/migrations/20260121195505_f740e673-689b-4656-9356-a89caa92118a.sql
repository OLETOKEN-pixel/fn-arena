-- Make proofs bucket private and move proof references to stored paths + signed URLs

-- 1) Make bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'proofs';

-- 2) Store canonical storage path on match_proofs
ALTER TABLE public.match_proofs
ADD COLUMN IF NOT EXISTS storage_path text;

-- Backfill storage_path for existing rows that stored public URLs
UPDATE public.match_proofs
SET storage_path = split_part(image_url, '/proofs/', 2)
WHERE storage_path IS NULL
  AND image_url LIKE '%/proofs/%';

-- 3) New RPC for creating proof rows using storage path (client will use signed URLs for display)
CREATE OR REPLACE FUNCTION public.create_match_proof_v2(
  p_match_id uuid,
  p_storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_exists boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing storage path');
  END IF;

  -- Must be a participant (or admin)
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = v_user_id
  ) INTO v_exists;

  IF NOT v_exists AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Insert proof row. We store the storage path (not a public URL)
  INSERT INTO public.match_proofs (match_id, user_id, image_url, storage_path)
  VALUES (p_match_id, v_user_id, p_storage_path, p_storage_path);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_match_proof_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_match_proof_v2(uuid, text) TO authenticated;
