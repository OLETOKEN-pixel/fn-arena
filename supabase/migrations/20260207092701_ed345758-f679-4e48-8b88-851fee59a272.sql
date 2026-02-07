
-- =============================================
-- HIGHLIGHTS VOTING SYSTEM + WEEKLY WINNER
-- =============================================

-- 1. Create highlight_votes table
CREATE TABLE public.highlight_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  highlight_id uuid NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  week_start date NOT NULL DEFAULT (date_trunc('week', now()))::date,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT highlight_votes_unique_per_week UNIQUE(user_id, week_start)
);

-- 2. Add weekly winner columns to highlights
ALTER TABLE public.highlights 
  ADD COLUMN IF NOT EXISTS is_weekly_winner boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_week date DEFAULT NULL;

-- 3. Enable RLS
ALTER TABLE public.highlight_votes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Anyone can view votes"
  ON public.highlight_votes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert votes"
  ON public.highlight_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON public.highlight_votes FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Indexes
CREATE INDEX idx_highlight_votes_highlight ON public.highlight_votes(highlight_id);
CREATE INDEX idx_highlight_votes_week ON public.highlight_votes(week_start);
CREATE INDEX idx_highlight_votes_user_week ON public.highlight_votes(user_id, week_start);

-- 6. RPC: vote_highlight (toggle/switch vote)
CREATE OR REPLACE FUNCTION public.vote_highlight(p_highlight_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_week_start date;
  v_existing_vote record;
  v_action text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_week_start := (date_trunc('week', now()))::date;
  
  -- Check if user already voted this week
  SELECT * INTO v_existing_vote
  FROM highlight_votes
  WHERE user_id = v_user_id AND week_start = v_week_start;
  
  IF v_existing_vote IS NOT NULL THEN
    IF v_existing_vote.highlight_id = p_highlight_id THEN
      -- Same highlight: toggle off (unvote)
      DELETE FROM highlight_votes WHERE id = v_existing_vote.id;
      v_action := 'unvoted';
    ELSE
      -- Different highlight: switch vote
      DELETE FROM highlight_votes WHERE id = v_existing_vote.id;
      INSERT INTO highlight_votes (user_id, highlight_id, week_start)
      VALUES (v_user_id, p_highlight_id, v_week_start);
      v_action := 'switched';
    END IF;
  ELSE
    -- No vote yet: insert
    INSERT INTO highlight_votes (user_id, highlight_id, week_start)
    VALUES (v_user_id, p_highlight_id, v_week_start);
    v_action := 'voted';
  END IF;
  
  RETURN json_build_object('success', true, 'action', v_action);
END;
$$;

-- 7. RPC: mark_weekly_winner (admin only)
CREATE OR REPLACE FUNCTION public.mark_weekly_winner(p_highlight_id uuid, p_week date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
  END IF;
  
  -- Clear previous winner for this week
  UPDATE highlights SET is_weekly_winner = false, winner_week = NULL
  WHERE winner_week = p_week;
  
  -- Set new winner
  UPDATE highlights SET is_weekly_winner = true, winner_week = p_week
  WHERE id = p_highlight_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- 8. Enable realtime for votes
ALTER PUBLICATION supabase_realtime ADD TABLE public.highlight_votes;
