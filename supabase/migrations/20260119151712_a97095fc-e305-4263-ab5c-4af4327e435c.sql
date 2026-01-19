-- Create highlights table for YouTube video montages
CREATE TABLE public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_highlights_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

-- Policies: everyone can view, users can manage their own, admins can delete any
CREATE POLICY "Anyone can view highlights"
  ON public.highlights FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own highlights"
  ON public.highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own highlights"
  ON public.highlights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own highlights or admin can delete any"
  ON public.highlights FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- Create updated_at trigger
CREATE TRIGGER update_highlights_updated_at
  BEFORE UPDATE ON public.highlights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create match_proofs table for screenshot evidence
CREATE TABLE public.match_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_match_proofs_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.match_proofs ENABLE ROW LEVEL SECURITY;

-- Policy: only match participants and admins can view/insert proofs
CREATE POLICY "Match participants and admins can view proofs"
  ON public.match_proofs FOR SELECT
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM match_participants mp
      WHERE mp.match_id = match_proofs.match_id
      AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Match participants can insert proofs"
  ON public.match_proofs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM match_participants mp
      WHERE mp.match_id = match_proofs.match_id
      AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own proofs or admin can delete any"
  ON public.match_proofs FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- Create storage bucket for proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for proofs bucket
CREATE POLICY "Match participants can view proof files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'proofs' AND
    (
      public.is_admin() OR
      EXISTS (
        SELECT 1 FROM match_participants mp
        WHERE mp.match_id = (storage.foldername(name))[1]::uuid
        AND mp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Match participants can upload proof files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'proofs' AND
    EXISTS (
      SELECT 1 FROM match_participants mp
      WHERE mp.match_id = (storage.foldername(name))[1]::uuid
      AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own proof files or admin can delete any"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'proofs' AND
    (
      public.is_admin() OR
      auth.uid()::text = (storage.foldername(name))[2]
    )
  );

-- Enable realtime for highlights
ALTER PUBLICATION supabase_realtime ADD TABLE public.highlights;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_proofs;