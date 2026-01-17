// OLEBOY TOKEN - Type Definitions

export type UserRole = 'user' | 'admin';

export type Region = 'EU' | 'NA-East' | 'NA-West' | 'OCE' | 'BR' | 'ASIA' | 'ME';

export type Platform = 'PC' | 'Console' | 'Mobile' | 'All';

export type GameMode = 'Box Fight' | 'Realistic' | 'Zone Wars' | '1v1' | '2v2' | '3v3' | '4v4';

// New comprehensive match status
export type MatchStatus = 
  | 'open'           // Match pubblico, in attesa di avversario
  | 'ready_check'    // Avversario joinato, fase ready-up
  | 'in_progress'    // Tutti ready, partita in corso
  | 'result_pending' // In attesa dichiarazione risultati
  | 'completed'      // Match concluso con payout
  | 'disputed'       // Conflitto risultati
  | 'canceled'       // Cancellato dall'host (solo se open)
  | 'admin_resolved' // Risolto da admin
  // Legacy states for backwards compatibility
  | 'joined'
  | 'full'
  | 'started'
  | 'finished'
  | 'expired';

export type TransactionType = 'deposit' | 'lock' | 'unlock' | 'payout' | 'refund' | 'fee';

export type TeamMemberRole = 'owner' | 'captain' | 'member';

export type TeamMemberStatus = 'pending' | 'accepted' | 'rejected';

export type MatchResultStatus = 'pending' | 'confirmed' | 'disputed' | 'resolved';

export type TeamSide = 'A' | 'B';

export type ResultChoice = 'WIN' | 'LOSS';

export interface Profile {
  id: string;
  user_id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  epic_username: string | null;
  preferred_region: Region;
  preferred_platform: Platform;
  role: UserRole;
  is_banned: boolean;
  paypal_email: string | null;
  iban: string | null;
  created_at: string;
  updated_at: string;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  payment_method: 'paypal' | 'bank';
  payment_details: string;
  status: WithdrawalStatus;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  profile?: Profile;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  locked_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  match_id: string | null;
  stripe_session_id: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  owner?: Profile;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface Match {
  id: string;
  creator_id: string;
  game: string;
  region: Region;
  platform: Platform;
  mode: GameMode;
  team_size: number;
  first_to: number;
  entry_fee: number;
  is_private: boolean;
  private_code: string | null;
  status: MatchStatus;
  expires_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  creator?: Profile;
  participants?: MatchParticipant[];
  result?: MatchResult;
}

export interface MatchParticipant {
  id: string;
  match_id: string;
  user_id: string;
  team_id: string | null;
  team_side: TeamSide | null;
  ready: boolean;
  ready_at: string | null;
  result_choice: ResultChoice | null;
  result_at: string | null;
  status: 'joined' | 'ready' | 'playing' | 'finished' | 'left';
  joined_at: string;
  profile?: Profile;
  team?: Team;
}

export interface MatchResult {
  id: string;
  match_id: string;
  winner_user_id: string | null;
  winner_team_id: string | null;
  loser_confirmed: boolean;
  winner_confirmed: boolean;
  proof_url: string | null;
  dispute_reason: string | null;
  admin_notes: string | null;
  resolved_by: string | null;
  status: MatchResultStatus;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  is_deleted: boolean;
  deleted_by: string | null;
  created_at: string;
  profile?: Profile;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  total_matches: number;
  total_earnings: number;
}

// Coin package for shop
export interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  popular?: boolean;
  bonus?: number;
}

// Constants
export const REGIONS: Region[] = ['EU', 'NA-East', 'NA-West', 'OCE', 'BR', 'ASIA', 'ME'];

export const PLATFORMS: Platform[] = ['PC', 'Console', 'Mobile', 'All'];

export const GAME_MODES: GameMode[] = ['Box Fight', 'Realistic', 'Zone Wars', '1v1', '2v2', '3v3', '4v4'];

export const FIRST_TO_OPTIONS = [1, 3, 5, 7, 10] as const;

export const ENTRY_FEE_PRESETS = [0.5, 1, 5, 10, 25, 50] as const;

export const PLATFORM_FEE = 0.05; // 5%

export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'pack-5', coins: 5, price: 5 },
  { id: 'pack-10', coins: 10, price: 10, popular: true },
  { id: 'pack-15', coins: 15, price: 15 },
  { id: 'pack-20', coins: 20, price: 20 },
  { id: 'pack-25', coins: 25, price: 25 },
  { id: 'pack-50', coins: 50, price: 50, bonus: 5 },
];

// Status labels for UI
export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'OPEN',
  ready_check: 'READY CHECK',
  in_progress: 'IN PROGRESS',
  result_pending: 'AWAITING RESULT',
  completed: 'COMPLETED',
  disputed: 'DISPUTED',
  canceled: 'CANCELED',
  admin_resolved: 'RESOLVED',
  joined: 'JOINED',
  full: 'FULL',
  started: 'LIVE',
  finished: 'FINISHED',
  expired: 'EXPIRED',
};

// Helper to check if match requires user action
export const matchRequiresAction = (match: Match, userId: string): boolean => {
  const participant = match.participants?.find(p => p.user_id === userId);
  if (!participant) return false;
  
  if (match.status === 'ready_check' && !participant.ready) return true;
  if ((match.status === 'in_progress' || match.status === 'result_pending') && !participant.result_choice) return true;
  
  return false;
};
