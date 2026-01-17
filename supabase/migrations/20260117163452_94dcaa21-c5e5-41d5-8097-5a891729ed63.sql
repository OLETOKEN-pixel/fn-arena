-- ===========================================
-- OLEBOY TOKEN - Complete Database Schema
-- ===========================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- PROFILES TABLE (linked to auth.users)
-- ===========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  epic_username TEXT,
  preferred_region TEXT DEFAULT 'EU',
  preferred_platform TEXT DEFAULT 'PC',
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- WALLETS TABLE
-- ===========================================
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0.00 CHECK (balance >= 0),
  locked_balance DECIMAL(10, 2) DEFAULT 0.00 CHECK (locked_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Wallet policies
CREATE POLICY "Users can view own wallet"
  ON public.wallets FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can update wallets"
  ON public.wallets FOR UPDATE USING (auth.uid() = user_id);

-- ===========================================
-- TRANSACTIONS TABLE
-- ===========================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'lock', 'unlock', 'payout', 'refund', 'fee')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  match_id UUID,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Transaction policies
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- TEAMS TABLE
-- ===========================================
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE CHECK (LENGTH(tag) <= 5),
  description TEXT,
  logo_url TEXT,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team policies
CREATE POLICY "Teams are viewable by everyone"
  ON public.teams FOR SELECT USING (true);

CREATE POLICY "Owner can update team"
  ON public.teams FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can delete team"
  ON public.teams FOR DELETE USING (auth.uid() = owner_id);

-- ===========================================
-- TEAM MEMBERS TABLE
-- ===========================================
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'captain', 'member')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  invited_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team member policies
CREATE POLICY "Team members viewable by all"
  ON public.team_members FOR SELECT USING (true);

CREATE POLICY "Team owners can manage members"
  ON public.team_members FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );

CREATE POLICY "Members can update own status"
  ON public.team_members FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
  );

CREATE POLICY "Team owners can delete members"
  ON public.team_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );

-- ===========================================
-- MATCHES TABLE
-- ===========================================
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  game TEXT DEFAULT 'FN' NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('EU', 'NA-East', 'NA-West', 'OCE', 'BR', 'ASIA', 'ME')),
  platform TEXT NOT NULL CHECK (platform IN ('PC', 'Console', 'Mobile', 'All')),
  mode TEXT NOT NULL CHECK (mode IN ('Box Fight', 'Realistic', 'Zone Wars', '1v1', '2v2', '3v3', '4v4')),
  team_size INTEGER DEFAULT 1 CHECK (team_size >= 1 AND team_size <= 4),
  first_to INTEGER DEFAULT 3 CHECK (first_to IN (1, 3, 5, 7, 10)),
  entry_fee DECIMAL(10, 2) NOT NULL CHECK (entry_fee >= 0),
  is_private BOOLEAN DEFAULT false,
  private_code TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'full', 'started', 'finished', 'canceled', 'expired', 'disputed')),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Match policies
CREATE POLICY "Matches viewable by all"
  ON public.matches FOR SELECT USING (true);

CREATE POLICY "Users can create matches"
  ON public.matches FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can update match"
  ON public.matches FOR UPDATE USING (auth.uid() = creator_id);

-- ===========================================
-- MATCH PARTICIPANTS TABLE
-- ===========================================
CREATE TABLE public.match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id),
  status TEXT DEFAULT 'joined' CHECK (status IN ('joined', 'ready', 'playing', 'finished', 'left')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id, user_id)
);

-- Enable RLS
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Match participant policies
CREATE POLICY "Participants viewable by all"
  ON public.match_participants FOR SELECT USING (true);

CREATE POLICY "Users can join matches"
  ON public.match_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
  ON public.match_participants FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave matches"
  ON public.match_participants FOR DELETE USING (auth.uid() = user_id);

-- ===========================================
-- MATCH RESULTS TABLE
-- ===========================================
CREATE TABLE public.match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES public.profiles(user_id),
  winner_team_id UUID REFERENCES public.teams(id),
  loser_confirmed BOOLEAN DEFAULT false,
  winner_confirmed BOOLEAN DEFAULT false,
  proof_url TEXT,
  dispute_reason TEXT,
  admin_notes TEXT,
  resolved_by UUID REFERENCES public.profiles(user_id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disputed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

-- Match result policies
CREATE POLICY "Results viewable by all"
  ON public.match_results FOR SELECT USING (true);

CREATE POLICY "Participants can insert results"
  ON public.match_results FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.match_participants WHERE match_id = match_results.match_id AND user_id = auth.uid())
  );

CREATE POLICY "Participants can update results"
  ON public.match_results FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.match_participants WHERE match_id = match_results.match_id AND user_id = auth.uid())
  );

-- ===========================================
-- CHAT MESSAGES TABLE (Global Chat)
-- ===========================================
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (LENGTH(message) <= 500),
  is_deleted BOOLEAN DEFAULT false,
  deleted_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat message policies
CREATE POLICY "Messages viewable by all"
  ON public.chat_messages FOR SELECT USING (true);

CREATE POLICY "Users can send messages"
  ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can delete messages"
  ON public.chat_messages FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ===========================================
-- LEADERBOARD VIEW
-- ===========================================
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.avatar_url,
  COUNT(DISTINCT CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN mr.match_id END) as wins,
  COUNT(DISTINCT mp.match_id) as total_matches,
  COALESCE(SUM(CASE WHEN mr.winner_user_id = p.user_id AND mr.status = 'confirmed' THEN m.entry_fee * 1.9 ELSE 0 END), 0) as total_earnings
FROM public.profiles p
LEFT JOIN public.match_participants mp ON mp.user_id = p.user_id
LEFT JOIN public.matches m ON m.id = mp.match_id AND m.status = 'finished'
LEFT JOIN public.match_results mr ON mr.match_id = m.id
GROUP BY p.id, p.user_id, p.username, p.avatar_url
ORDER BY wins DESC, total_earnings DESC;

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_match_results_updated_at
  BEFORE UPDATE ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create wallet when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- ===========================================
-- ENABLE REALTIME FOR CHAT
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;