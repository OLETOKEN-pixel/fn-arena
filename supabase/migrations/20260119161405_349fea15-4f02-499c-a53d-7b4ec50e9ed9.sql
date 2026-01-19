-- Make the proofs bucket public so getPublicUrl() works
UPDATE storage.buckets 
SET public = true 
WHERE id = 'proofs';