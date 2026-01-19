-- ============================================
-- FASE 4: Weekly Leaderboard View (retry)
-- ============================================

-- Create weekly leaderboard view (coins earned this week from match payouts)
CREATE OR REPLACE VIEW public.leaderboard_weekly AS
SELECT 
  p.user_id,
  p.username,
  p.avatar_url,
  COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount ELSE 0 END), 0) as weekly_earned
FROM profiles p
LEFT JOIN transactions t ON t.user_id = p.user_id 
  AND t.created_at >= date_trunc('week', now())
  AND t.type = 'payout'
GROUP BY p.user_id, p.username, p.avatar_url
HAVING COALESCE(SUM(CASE WHEN t.type = 'payout' AND t.amount > 0 THEN t.amount ELSE 0 END), 0) > 0
ORDER BY weekly_earned DESC
LIMIT 10;

-- ============================================
-- FASE 5: Epic Username Check (without unique constraint for now)
-- ============================================

-- Function to check epic username availability
CREATE OR REPLACE FUNCTION public.check_epic_username_available(p_epic_username TEXT, p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE LOWER(epic_username) = LOWER(p_epic_username)
    AND (p_user_id IS NULL OR user_id != p_user_id)
  );
$$;

-- ============================================
-- FASE 6: Admin Delete User Function
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_prepare_delete_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_match_count INT;
  v_transaction_count INT;
BEGIN
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;
  
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF v_profile.role = 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot delete admin users');
  END IF;
  
  SELECT COUNT(*) INTO v_match_count FROM match_participants WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_transaction_count FROM transactions WHERE user_id = p_user_id;
  
  DELETE FROM match_chat_messages WHERE user_id = p_user_id;
  DELETE FROM match_participants WHERE user_id = p_user_id;
  DELETE FROM match_proofs WHERE user_id = p_user_id;
  DELETE FROM tips WHERE from_user_id = p_user_id OR to_user_id = p_user_id;
  DELETE FROM vip_subscriptions WHERE user_id = p_user_id;
  DELETE FROM transactions WHERE user_id = p_user_id;
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM team_members WHERE user_id = p_user_id;
  DELETE FROM highlights WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE user_id = p_user_id;
  
  INSERT INTO admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_user_data', 'user', p_user_id, jsonb_build_object(
    'username', v_profile.username,
    'email', v_profile.email,
    'matches_deleted', v_match_count,
    'transactions_deleted', v_transaction_count
  ));
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User data deleted',
    'user_id', p_user_id
  );
END;
$$;

-- ============================================
-- FASE 2: Player Stats Function
-- ============================================

CREATE OR REPLACE FUNCTION public.get_player_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_total_matches INT;
  v_wins INT;
  v_losses INT;
  v_win_rate NUMERIC;
  v_total_earned NUMERIC;
  v_total_profit NUMERIC;
  v_avg_profit NUMERIC;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;
  
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  SELECT COUNT(*) INTO v_total_matches
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.user_id = p_user_id 
    AND m.status IN ('completed', 'finished');
  
  SELECT COUNT(*) INTO v_wins
  FROM match_results mr
  WHERE mr.winner_user_id = p_user_id 
    AND mr.status IN ('confirmed', 'resolved');
  
  v_losses := GREATEST(0, v_total_matches - v_wins);
  v_win_rate := CASE WHEN v_total_matches > 0 THEN ROUND((v_wins::NUMERIC / v_total_matches) * 100, 1) ELSE 0 END;
  
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE 
      WHEN type = 'payout' THEN amount 
      WHEN type = 'fee' AND match_id IS NOT NULL THEN -amount
      ELSE 0 
    END), 0)
  INTO v_total_earned, v_total_profit
  FROM transactions
  WHERE user_id = p_user_id;
  
  v_avg_profit := CASE WHEN v_total_matches > 0 THEN ROUND(v_total_profit / v_total_matches, 2) ELSE 0 END;
  
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'username', v_profile.username,
    'avatar_url', v_profile.avatar_url,
    'epic_username', v_profile.epic_username,
    'total_matches', v_total_matches,
    'wins', v_wins,
    'losses', v_losses,
    'win_rate', v_win_rate,
    'total_earned', v_total_earned,
    'total_profit', v_total_profit,
    'avg_profit_per_match', v_avg_profit,
    'member_since', v_profile.created_at
  );
END;
$$;