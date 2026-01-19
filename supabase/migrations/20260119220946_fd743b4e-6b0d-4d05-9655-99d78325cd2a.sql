-- ============================================
-- FASE 1: VIP Subscription + Tips System
-- ============================================

-- Table: VIP subscriptions
CREATE TABLE public.vip_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vip_subscriptions
CREATE POLICY "Users can view own VIP status"
  ON public.vip_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all VIP"
  ON public.vip_subscriptions FOR SELECT
  USING (is_admin());

-- Table: Tips (coin transfers between users)
CREATE TABLE public.tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_tip CHECK (from_user_id != to_user_id)
);

-- Enable RLS
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tips
CREATE POLICY "Users can view tips they sent or received"
  ON public.tips FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Admins can view all tips"
  ON public.tips FOR SELECT
  USING (is_admin());

-- ============================================
-- Function: Check VIP Status
-- ============================================
CREATE OR REPLACE FUNCTION public.check_vip_status(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user UUID;
  v_subscription RECORD;
  v_days_remaining INT;
BEGIN
  v_target_user := COALESCE(p_user_id, auth.uid());
  
  SELECT * INTO v_subscription
  FROM vip_subscriptions
  WHERE user_id = v_target_user
    AND expires_at > now();
  
  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object(
      'is_vip', false,
      'expires_at', null,
      'days_remaining', 0
    );
  END IF;
  
  v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_subscription.expires_at - now()))::INT);
  
  RETURN jsonb_build_object(
    'is_vip', true,
    'expires_at', v_subscription.expires_at,
    'days_remaining', v_days_remaining
  );
END;
$$;

-- ============================================
-- Function: Purchase VIP (5 coins, 30 days)
-- ============================================
CREATE OR REPLACE FUNCTION public.purchase_vip()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet RECORD;
  v_cost NUMERIC := 5;
  v_duration INTERVAL := '30 days';
  v_new_expires TIMESTAMPTZ;
  v_current_sub RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  
  IF v_wallet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  IF v_wallet.balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Check existing subscription
  SELECT * INTO v_current_sub FROM vip_subscriptions WHERE user_id = v_user_id;
  
  -- Calculate new expiration (extend if already VIP)
  IF v_current_sub IS NOT NULL AND v_current_sub.expires_at > now() THEN
    v_new_expires := v_current_sub.expires_at + v_duration;
  ELSE
    v_new_expires := now() + v_duration;
  END IF;
  
  -- Deduct coins
  UPDATE wallets SET balance = balance - v_cost WHERE user_id = v_user_id;
  
  -- Upsert subscription
  INSERT INTO vip_subscriptions (user_id, expires_at)
  VALUES (v_user_id, v_new_expires)
  ON CONFLICT (user_id) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    started_at = CASE 
      WHEN vip_subscriptions.expires_at < now() THEN now()
      ELSE vip_subscriptions.started_at
    END;
  
  -- Log transaction
  INSERT INTO transactions (user_id, type, amount, description)
  VALUES (v_user_id, 'fee', -v_cost, 'VIP Subscription (30 days)');
  
  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expires,
    'days_remaining', 30
  );
END;
$$;

-- ============================================
-- Function: Send Tip (VIP only, anti-abuse)
-- ============================================
CREATE OR REPLACE FUNCTION public.send_tip(p_to_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sender_wallet RECORD;
  v_receiver_wallet RECORD;
  v_is_vip BOOLEAN;
  v_tips_today INT;
  v_max_tips_per_day INT := 10;
  v_max_tip_amount NUMERIC := 50;
  v_receiver_profile RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF v_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot tip yourself');
  END IF;
  
  IF p_amount <= 0 OR p_amount > v_max_tip_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount (max 50 coins)');
  END IF;
  
  -- Check VIP status
  SELECT (check_vip_status(v_user_id)->>'is_vip')::BOOLEAN INTO v_is_vip;
  
  IF NOT v_is_vip THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP required to send tips');
  END IF;
  
  -- Check daily limit
  SELECT COUNT(*) INTO v_tips_today
  FROM tips
  WHERE from_user_id = v_user_id
    AND created_at > now() - INTERVAL '24 hours';
  
  IF v_tips_today >= v_max_tips_per_day THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily tip limit reached (10/day)');
  END IF;
  
  -- Get sender wallet
  SELECT * INTO v_sender_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  
  IF v_sender_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Get receiver wallet
  SELECT * INTO v_receiver_wallet FROM wallets WHERE user_id = p_to_user_id FOR UPDATE;
  
  IF v_receiver_wallet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
  END IF;
  
  -- Get receiver profile for notification
  SELECT username INTO v_receiver_profile FROM profiles WHERE user_id = p_to_user_id;
  
  -- Transfer coins
  UPDATE wallets SET balance = balance - p_amount WHERE user_id = v_user_id;
  UPDATE wallets SET balance = balance + p_amount WHERE user_id = p_to_user_id;
  
  -- Log tip
  INSERT INTO tips (from_user_id, to_user_id, amount) VALUES (v_user_id, p_to_user_id, p_amount);
  
  -- Log transactions
  INSERT INTO transactions (user_id, type, amount, description)
  VALUES 
    (v_user_id, 'fee', -p_amount, 'Tip sent to @' || v_receiver_profile.username),
    (p_to_user_id, 'payout', p_amount, 'Tip received');
  
  RETURN jsonb_build_object('success', true, 'amount', p_amount);
END;
$$;

-- ============================================
-- Function: Change Username (VIP only)
-- ============================================
CREATE OR REPLACE FUNCTION public.change_username_vip(p_new_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_vip BOOLEAN;
  v_existing RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF length(p_new_username) < 3 OR length(p_new_username) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username must be 3-20 characters');
  END IF;
  
  IF p_new_username !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username can only contain letters, numbers, and underscores');
  END IF;
  
  -- Check VIP status
  SELECT (check_vip_status(v_user_id)->>'is_vip')::BOOLEAN INTO v_is_vip;
  
  IF NOT v_is_vip THEN
    RETURN jsonb_build_object('success', false, 'error', 'VIP required to change username');
  END IF;
  
  -- Check if username is taken
  SELECT user_id INTO v_existing FROM profiles WHERE LOWER(username) = LOWER(p_new_username);
  
  IF v_existing.user_id IS NOT NULL AND v_existing.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username already taken');
  END IF;
  
  -- Update username
  UPDATE profiles SET username = p_new_username WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'username', p_new_username);
END;
$$;