-- Create admin_action_logs table for audit trail
CREATE TABLE public.admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'resolve_dispute', 'ban_user', 'adjust_balance', 'fix_locks', etc.
  target_type TEXT NOT NULL, -- 'match', 'user', 'withdrawal', 'system'
  target_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view action logs"
  ON public.admin_action_logs
  FOR SELECT
  USING (is_admin());

-- Only admins can insert logs (via RPCs)
CREATE POLICY "Admins can insert action logs"
  ON public.admin_action_logs
  FOR INSERT
  WITH CHECK (is_admin());

-- Create RPC to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type TEXT,
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), p_action_type, p_target_type, p_target_id, p_details)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Create RPC to get admin issue stats (disputes, ghost locks, stuck matches)
CREATE OR REPLACE FUNCTION public.get_admin_issue_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_disputed INT;
  v_expired_with_locks INT;
  v_stuck_ready INT;
  v_inconsistent INT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Count disputed matches
  SELECT COUNT(*) INTO v_disputed FROM matches WHERE status = 'disputed';

  -- Count expired matches where users still have locked balance related to those matches
  SELECT COUNT(DISTINCT m.id) INTO v_expired_with_locks
  FROM matches m
  JOIN match_participants mp ON mp.match_id = m.id
  JOIN wallets w ON w.user_id = mp.user_id
  WHERE m.status = 'expired' AND w.locked_balance > 0;

  -- Count matches in ready_check for more than 10 minutes
  SELECT COUNT(*) INTO v_stuck_ready
  FROM matches
  WHERE status = 'ready_check' 
    AND started_at IS NULL 
    AND created_at < NOW() - INTERVAL '10 minutes';

  -- Count matches with inconsistent results (both WIN or both LOSS)
  SELECT COUNT(DISTINCT m.id) INTO v_inconsistent
  FROM matches m
  JOIN match_participants mp_a ON mp_a.match_id = m.id AND mp_a.team_side = 'A'
  JOIN match_participants mp_b ON mp_b.match_id = m.id AND mp_b.team_side = 'B'
  WHERE m.status IN ('finished', 'disputed')
    AND mp_a.result_choice IS NOT NULL
    AND mp_b.result_choice IS NOT NULL
    AND mp_a.result_choice = mp_b.result_choice;

  v_result := jsonb_build_object(
    'disputed', v_disputed,
    'expired_with_locks', v_expired_with_locks,
    'stuck_ready_check', v_stuck_ready,
    'inconsistent_results', v_inconsistent,
    'total', v_disputed + v_expired_with_locks + v_stuck_ready + v_inconsistent
  );

  RETURN v_result;
END;
$$;

-- Create RPC to search across users, matches, transactions
CREATE OR REPLACE FUNCTION public.admin_global_search(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_users JSONB;
  v_matches JSONB;
  v_transactions JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Search users by username, email, or id
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'username', username,
    'email', email,
    'avatar_url', avatar_url,
    'is_banned', is_banned
  )), '[]'::jsonb) INTO v_users
  FROM profiles
  WHERE 
    username ILIKE '%' || p_query || '%'
    OR email ILIKE '%' || p_query || '%'
    OR id::text ILIKE '%' || p_query || '%'
    OR user_id::text ILIKE '%' || p_query || '%'
  LIMIT 5;

  -- Search matches by id, creator username, status
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'mode', m.mode,
    'region', m.region,
    'status', m.status,
    'entry_fee', m.entry_fee,
    'team_size', m.team_size,
    'creator_username', p.username,
    'created_at', m.created_at
  )), '[]'::jsonb) INTO v_matches
  FROM matches m
  LEFT JOIN profiles p ON p.user_id = m.creator_id
  WHERE 
    m.id::text ILIKE '%' || p_query || '%'
    OR m.status ILIKE '%' || p_query || '%'
    OR p.username ILIKE '%' || p_query || '%'
  LIMIT 5;

  -- Search transactions by id, match_id, description
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'type', t.type,
    'amount', t.amount,
    'description', t.description,
    'match_id', t.match_id,
    'user_id', t.user_id,
    'created_at', t.created_at
  )), '[]'::jsonb) INTO v_transactions
  FROM transactions t
  WHERE 
    t.id::text ILIKE '%' || p_query || '%'
    OR t.match_id::text ILIKE '%' || p_query || '%'
    OR t.description ILIKE '%' || p_query || '%'
  LIMIT 5;

  v_result := jsonb_build_object(
    'users', v_users,
    'matches', v_matches,
    'transactions', v_transactions
  );

  RETURN v_result;
END;
$$;

-- Create RPC to adjust user balance (admin only)
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get current balance
  SELECT balance INTO v_current_balance FROM wallets WHERE user_id = p_user_id;
  
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User wallet not found');
  END IF;

  v_new_balance := v_current_balance + p_amount;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resulting balance would be negative');
  END IF;

  -- Update balance
  UPDATE wallets SET balance = v_new_balance, updated_at = NOW() WHERE user_id = p_user_id;

  -- Create transaction record
  INSERT INTO transactions (user_id, type, amount, description, status)
  VALUES (p_user_id, CASE WHEN p_amount >= 0 THEN 'deposit' ELSE 'fee' END, ABS(p_amount), 'Admin: ' || p_reason, 'completed');

  -- Log action
  PERFORM log_admin_action('adjust_balance', 'user', p_user_id, jsonb_build_object('amount', p_amount, 'reason', p_reason, 'old_balance', v_current_balance, 'new_balance', v_new_balance));

  RETURN jsonb_build_object('success', true, 'old_balance', v_current_balance, 'new_balance', v_new_balance);
END;
$$;