
-- ============================================
-- CHALLENGES SYSTEM - FULL MIGRATION
-- ============================================

-- 1. Challenges definitions table (admin managed)
CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'match_completed', 'ready_up_fast', 'proof_uploaded', 'match_created_started'
  )),
  target_value INT NOT NULL DEFAULT 1,
  reward_xp INT NOT NULL DEFAULT 0,
  reward_coin NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User challenge progress table
CREATE TABLE public.user_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  progress_value INT NOT NULL DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  is_claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  reward_granted_xp INT DEFAULT 0,
  reward_granted_coin NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, challenge_id, period_key)
);

-- 3. Challenge event log for idempotency
CREATE TABLE public.challenge_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  challenge_id UUID,
  event_type TEXT NOT NULL,
  source_id UUID,
  event_hash TEXT NOT NULL UNIQUE,
  processed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. User XP tracking
CREATE TABLE public.user_xp (
  user_id UUID PRIMARY KEY,
  total_xp INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Anti-abuse tracking (max 3 matches vs same opponent/day)
CREATE TABLE public.challenge_anti_abuse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  opponent_key TEXT NOT NULL,
  match_date DATE NOT NULL DEFAULT CURRENT_DATE,
  match_count INT DEFAULT 1,
  UNIQUE (user_id, opponent_key, match_date)
);

-- 6. Add challenge_progress_id to transactions for idempotent rewards
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS challenge_progress_id UUID UNIQUE;

-- Enable RLS
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_anti_abuse ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view active challenges" ON public.challenges
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage challenges" ON public.challenges
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users view own progress" ON public.user_challenge_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert progress" ON public.user_challenge_progress
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update progress" ON public.user_challenge_progress
  FOR UPDATE USING (true);

CREATE POLICY "Users view own XP" ON public.user_xp
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view XP" ON public.user_xp
  FOR SELECT USING (true);

CREATE POLICY "System can manage XP" ON public.user_xp
  FOR ALL USING (true);

CREATE POLICY "System can manage event log" ON public.challenge_event_log
  FOR ALL USING (true);

CREATE POLICY "System can manage anti-abuse" ON public.challenge_anti_abuse
  FOR ALL USING (true);

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_challenge_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_xp;

-- Indexes for performance
CREATE INDEX idx_user_challenge_progress_user ON public.user_challenge_progress(user_id);
CREATE INDEX idx_user_challenge_progress_period ON public.user_challenge_progress(user_id, period_key);
CREATE INDEX idx_challenge_event_log_user ON public.challenge_event_log(user_id);
CREATE INDEX idx_challenge_event_log_hash ON public.challenge_event_log(event_hash);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get current period key (daily or weekly)
CREATE OR REPLACE FUNCTION public.get_current_period_key(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_type = 'daily' THEN
    RETURN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  ELSIF p_type = 'weekly' THEN
    RETURN to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
  END IF;
  RETURN NULL;
END;
$$;

-- Check anti-abuse (returns true if event should count)
CREATE OR REPLACE FUNCTION public.check_challenge_anti_abuse(
  p_user_id UUID,
  p_opponent_user_id UUID,
  p_opponent_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_opponent_key TEXT;
  v_count INT;
BEGIN
  -- Determine opponent key
  IF p_opponent_team_id IS NOT NULL THEN
    v_opponent_key := 'team:' || p_opponent_team_id::TEXT;
  ELSIF p_opponent_user_id IS NOT NULL THEN
    v_opponent_key := 'user:' || p_opponent_user_id::TEXT;
  ELSE
    RETURN true; -- No opponent info, allow
  END IF;
  
  -- Upsert counter
  INSERT INTO challenge_anti_abuse (user_id, opponent_key, match_date, match_count)
  VALUES (p_user_id, v_opponent_key, CURRENT_DATE, 1)
  ON CONFLICT (user_id, opponent_key, match_date)
  DO UPDATE SET match_count = challenge_anti_abuse.match_count + 1
  RETURNING match_count INTO v_count;
  
  -- Allow only first 3 matches
  RETURN v_count <= 3;
END;
$$;

-- Record challenge event with idempotency
CREATE OR REPLACE FUNCTION public.record_challenge_event(
  p_user_id UUID,
  p_event_type TEXT,
  p_source_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_hash TEXT;
  v_existing RECORD;
BEGIN
  -- Generate unique event hash
  v_event_hash := md5(p_user_id::TEXT || p_event_type || COALESCE(p_source_id::TEXT, 'null'));
  
  -- Check if already processed (idempotency)
  SELECT * INTO v_existing FROM challenge_event_log WHERE event_hash = v_event_hash;
  
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;
  
  -- Insert event log
  INSERT INTO challenge_event_log (user_id, event_type, source_id, event_hash)
  VALUES (p_user_id, p_event_type, p_source_id, v_event_hash);
  
  -- Update progress for matching challenges
  PERFORM update_challenge_progress(p_user_id, p_event_type, p_source_id);
  
  RETURN jsonb_build_object('success', true, 'processed', true);
END;
$$;

-- Update challenge progress
CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id UUID,
  p_metric_type TEXT,
  p_source_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    
    -- Upsert progress
    INSERT INTO user_challenge_progress (user_id, challenge_id, period_key, progress_value)
    VALUES (p_user_id, v_challenge.id, v_period_key, 1)
    ON CONFLICT (user_id, challenge_id, period_key)
    DO UPDATE SET 
      progress_value = user_challenge_progress.progress_value + 1,
      updated_at = now();
    
    -- Check if now completed
    SELECT * INTO v_progress 
    FROM user_challenge_progress 
    WHERE user_id = p_user_id 
    AND challenge_id = v_challenge.id 
    AND period_key = v_period_key;
    
    IF v_progress.progress_value >= v_challenge.target_value AND NOT v_progress.is_completed THEN
      UPDATE user_challenge_progress 
      SET is_completed = true, completed_at = now()
      WHERE id = v_progress.id;
    END IF;
  END LOOP;
END;
$$;

-- Claim challenge reward (atomic)
CREATE OR REPLACE FUNCTION public.claim_challenge_reward(p_challenge_id UUID, p_period_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_progress RECORD;
  v_challenge RECORD;
  v_current_week TEXT;
  v_weekly_coins NUMERIC;
  v_actual_coin NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Lock progress row
  SELECT * INTO v_progress 
  FROM user_challenge_progress
  WHERE user_id = v_user_id 
  AND challenge_id = p_challenge_id 
  AND period_key = p_period_key
  FOR UPDATE;
  
  IF v_progress IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Progress not found');
  END IF;
  
  -- Idempotency: already claimed
  IF v_progress.is_claimed THEN
    RETURN jsonb_build_object('success', true, 'already_claimed', true);
  END IF;
  
  -- Must be completed
  IF NOT v_progress.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not completed');
  END IF;
  
  -- Get challenge details
  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id;
  
  v_actual_coin := v_challenge.reward_coin;
  
  -- Weekly coin cap check (EXACT period_key match)
  IF v_challenge.reward_coin > 0 THEN
    v_current_week := get_current_period_key('weekly');
    
    SELECT COALESCE(SUM(reward_granted_coin), 0) INTO v_weekly_coins
    FROM user_challenge_progress
    WHERE user_id = v_user_id 
    AND period_key = v_current_week
    AND is_claimed = true;
    
    IF v_weekly_coins >= 1 THEN
      v_actual_coin := 0; -- Cap reached
    END IF;
  END IF;
  
  -- Grant coin reward via transactions ledger
  IF v_actual_coin > 0 THEN
    INSERT INTO transactions (user_id, type, amount, description, challenge_progress_id, status)
    VALUES (v_user_id, 'payout', v_actual_coin, 'Challenge: ' || v_challenge.title, v_progress.id, 'completed');
    
    UPDATE wallets SET balance = balance + v_actual_coin, updated_at = now() 
    WHERE user_id = v_user_id;
  END IF;
  
  -- Grant XP (upsert)
  IF v_challenge.reward_xp > 0 THEN
    INSERT INTO user_xp (user_id, total_xp, updated_at)
    VALUES (v_user_id, v_challenge.reward_xp, now())
    ON CONFLICT (user_id) 
    DO UPDATE SET total_xp = user_xp.total_xp + EXCLUDED.total_xp, updated_at = now();
  END IF;
  
  -- Mark claimed
  UPDATE user_challenge_progress 
  SET is_claimed = true, 
      claimed_at = now(),
      reward_granted_xp = v_challenge.reward_xp,
      reward_granted_coin = v_actual_coin
  WHERE id = v_progress.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'xp', v_challenge.reward_xp, 
    'coin', v_actual_coin,
    'coin_capped', v_challenge.reward_coin > 0 AND v_actual_coin = 0
  );
END;
$$;

-- Get user challenges with progress
CREATE OR REPLACE FUNCTION public.get_user_challenges(p_type TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_daily_key TEXT;
  v_weekly_key TEXT;
  v_result JSONB;
BEGIN
  v_daily_key := get_current_period_key('daily');
  v_weekly_key := get_current_period_key('weekly');
  
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'type', c.type,
      'metric_type', c.metric_type,
      'target_value', c.target_value,
      'reward_xp', c.reward_xp,
      'reward_coin', c.reward_coin,
      'progress_value', COALESCE(p.progress_value, 0),
      'is_completed', COALESCE(p.is_completed, false),
      'is_claimed', COALESCE(p.is_claimed, false),
      'period_key', CASE WHEN c.type = 'daily' THEN v_daily_key ELSE v_weekly_key END
    )
    ORDER BY c.type, c.created_at
  ) INTO v_result
  FROM challenges c
  LEFT JOIN user_challenge_progress p 
    ON p.challenge_id = c.id 
    AND p.user_id = v_user_id
    AND p.period_key = CASE WHEN c.type = 'daily' THEN v_daily_key ELSE v_weekly_key END
  WHERE c.is_active = true
  AND (p_type IS NULL OR c.type = p_type);
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Get user XP
CREATE OR REPLACE FUNCTION public.get_user_xp()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_xp INT;
BEGIN
  SELECT total_xp INTO v_xp FROM user_xp WHERE user_id = auth.uid();
  RETURN COALESCE(v_xp, 0);
END;
$$;

-- ============================================
-- TRIGGER: Handle proof upload for challenges
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_proof_challenge_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match RECORD;
BEGIN
  -- Get match info to ensure it's valid
  SELECT * INTO v_match FROM matches WHERE id = NEW.match_id;
  
  -- Only count if match exists and is completed or in progress
  IF v_match IS NOT NULL AND v_match.status IN ('in_progress', 'result_pending', 'completed', 'finished') THEN
    PERFORM record_challenge_event(NEW.user_id, 'proof_uploaded', NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_proof_insert_challenge
AFTER INSERT ON public.match_proofs
FOR EACH ROW
EXECUTE FUNCTION handle_proof_challenge_event();

-- ============================================
-- SEED DATA: Default challenges
-- ============================================
INSERT INTO public.challenges (title, description, type, metric_type, target_value, reward_xp, reward_coin) VALUES
('Play 1 Match', 'Complete any match today', 'daily', 'match_completed', 1, 30, 0),
('Ready Up Fast', 'Ready within 2 minutes of joining', 'daily', 'ready_up_fast', 1, 20, 0),
('Good Proof', 'Upload proof screenshot in a match', 'daily', 'proof_uploaded', 1, 30, 0),
('Complete 10 Matches', 'Complete 10 matches this week', 'weekly', 'match_completed', 10, 50, 1),
('Create 5 Started', 'Create 5 matches that start playing', 'weekly', 'match_created_started', 5, 40, 1),
('Proof Streak', 'Upload proof in 5 different matches', 'weekly', 'proof_uploaded', 5, 50, 1);
