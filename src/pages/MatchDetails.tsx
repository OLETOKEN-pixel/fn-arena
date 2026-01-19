import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, XCircle, Loader2, Clock, Share2, Gamepad2, Globe, Monitor, Crosshair, Timer, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MatchStatusBadge, RegionBadge, PlatformBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { ReadyUpSection } from '@/components/matches/ReadyUpSection';
import { TeamResultDeclaration } from '@/components/matches/TeamResultDeclaration';
import { TeamParticipantsDisplay } from '@/components/matches/TeamParticipantsDisplay';
import { MatchProgressStepper } from '@/components/matches/MatchProgressStepper';
import { GameRulesPanel } from '@/components/matches/GameRulesPanel';
import { ProofSection } from '@/components/matches/ProofSection';
import { MatchChat } from '@/components/matches/MatchChat';
import { TeamSelector } from '@/components/teams/TeamSelector';
import { PaymentModeSelector } from '@/components/teams/PaymentModeSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Match, Team, TeamMember, Profile, TeamMemberWithBalance, PaymentMode } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface SelectedTeam extends Team {
  members: (TeamMember & { profile: Profile })[];
  memberBalances?: TeamMemberWithBalance[];
  acceptedMemberCount: number;
}

export default function MatchDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, wallet, isProfileComplete, refreshWallet } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [leaving, setLeaving] = useState(false);
  
  // Team join state
  const isJoinMode = searchParams.get('join') === 'true';
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cover');
  const [joining, setJoining] = useState(false);

  const fetchMatch = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        creator:profiles!matches_creator_id_fkey(user_id, username, avatar_url, epic_username),
        participants:match_participants(
          *,
          profile:profiles(user_id, username, avatar_url, epic_username)
        ),
        result:match_results(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      toast({
        title: 'Error',
        description: 'Match not found or could not be loaded.',
        variant: 'destructive',
      });
      navigate('/my-matches');
      return;
    }

    const matchData = data as unknown as Match;
    
    // Access control: if match is not open, only participants can view
    if (matchData.status !== 'open' && user) {
      const isParticipant = matchData.participants?.some(p => p.user_id === user.id);
      const isAdmin = profile?.role === 'admin';
      if (!isParticipant && !isAdmin) {
        toast({
          title: 'Access Denied',
          description: 'You are not a participant in this match.',
          variant: 'destructive',
        });
        navigate('/my-matches');
        return;
      }
    }

    setMatch(matchData);
    setLoading(false);
  };

  useEffect(() => {
    fetchMatch();
  }, [id, user]);

  const handleCancelMatch = async () => {
    if (!match) return;
    
    setCanceling(true);
    
    try {
      const { data, error } = await supabase.rpc('cancel_match_v2', {
        p_match_id: match.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel');
      }

      toast({
        title: 'Match Canceled',
        description: 'Your entry fee has been refunded.',
      });

      await refreshWallet();
      navigate('/matches');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel match',
        variant: 'destructive',
      });
    } finally {
      setCanceling(false);
    }
  };

  const handleLeaveMatch = async () => {
    if (!match) return;
    
    setLeaving(true);
    
    try {
      const { data, error } = await supabase.rpc('leave_match', {
        p_match_id: match.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to leave');
      }

      toast({
        title: 'Left Match',
        description: 'Your entry fee has been refunded.',
      });

      await refreshWallet();
      navigate('/matches');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to leave match',
        variant: 'destructive',
      });
    } finally {
      setLeaving(false);
    }
  };

  const handleJoinWithTeam = async () => {
    if (!match || !selectedTeam) return;
    
    setJoining(true);
    
    try {
      const { data, error } = await supabase.rpc('join_team_match', {
        p_match_id: match.id,
        p_team_id: selectedTeam.id,
        p_payment_mode: paymentMode,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to join');
      }

      toast({
        title: 'Team Joined!',
        description: 'Your team has joined the match. Get ready!',
      });

      await refreshWallet();
      // Remove join param and refresh
      navigate(`/matches/${match.id}`, { replace: true });
      fetchMatch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to join match',
        variant: 'destructive',
      });
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-background"><LoadingPage /></div>;
  if (!match) return null;

  const participantCount = match.participants?.length ?? 0;
  const maxParticipants = match.team_size * 2;
  const isCreator = user?.id === match.creator_id;
  const participant = match.participants?.find(p => p.user_id === user?.id);
  const isParticipant = !!participant;
  const isAdmin = profile?.role === 'admin';
  
  const canCancel = isCreator && match.status === 'open';
  const canLeave = isParticipant && !isCreator && match.status === 'ready_check' && !participant?.ready;
  
  const showReadyUp = match.status === 'ready_check' && isParticipant;
  const showResultDeclaration = isParticipant && (match.status === 'in_progress' || match.status === 'result_pending');
  
  // Show team join UI for team matches when in join mode
  const showTeamJoin = isJoinMode && match.status === 'open' && match.team_size > 1 && !isParticipant && user;
  
  // Calculate costs for team join
  const totalTeamCost = match.entry_fee * match.team_size;
  const canAffordCover = wallet && wallet.balance >= totalTeamCost;
  const canAffordSplit = selectedTeam?.memberBalances?.every(m => m.balance >= match.entry_fee) ?? false;
  const canJoinWithTeam = selectedTeam && (paymentMode === 'cover' ? canAffordCover : canAffordSplit);

  const copyMatchLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: 'Link copied!',
      description: 'Match link copied to clipboard',
    });
  };

  const prizePool = match.entry_fee * maxParticipants * 0.95;

  // Show chat for participants or admins when match is not open
  const showChat = (isParticipant || isAdmin) && match.status !== 'open';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ===== PREMIUM HEADER BAR ===== */}
      <div className="flex-shrink-0 border-b border-border/50 bg-gradient-to-r from-card via-card/95 to-card backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left - Back Button */}
            <Link
              to={match.status === 'open' ? '/matches' : '/my-matches'}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="hidden sm:inline text-sm font-medium">
                {match.status === 'open' ? 'Matches' : 'My Matches'}
              </span>
            </Link>

            {/* Center - Match Title & Info */}
            <div className="flex items-center gap-4 flex-1 justify-center">
              <div className="flex items-center gap-3 bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/30">
                  <Gamepad2 className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">
                      {match.team_size}v{match.team_size}
                    </span>
                    <span className="text-muted-foreground">{match.mode}</span>
                    <MatchStatusBadge status={match.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" /> {match.region}
                    </span>
                    <span className="flex items-center gap-1">
                      <Monitor className="w-3 h-3" /> {match.platform}
                    </span>
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3 h-3" /> FT{match.first_to}
                    </span>
                  </div>
                </div>
              </div>

              {/* Entry & Prize */}
              <div className="hidden md:flex items-center gap-3">
                <div className="flex flex-col items-center px-4 py-2 rounded-lg bg-secondary/30 border border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Entry</span>
                  <CoinDisplay amount={match.entry_fee} size="sm" />
                </div>
                <div className="flex flex-col items-center px-4 py-2 rounded-lg bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/30">
                  <span className="text-[10px] uppercase tracking-wider text-accent">Prize Pool</span>
                  <CoinDisplay amount={prizePool} size="sm" className="text-accent font-bold" />
                </div>
              </div>
            </div>

            {/* Right - Copy Link */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={copyMatchLink}
              className="border-border/50 hover:border-accent/50 hover:bg-accent/5"
            >
              <Share2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ===== FULL WIDTH PROGRESS STEPPER ===== */}
      <div className="flex-shrink-0 bg-gradient-to-b from-card/50 to-transparent border-b border-border/30">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <MatchProgressStepper status={match.status} />
        </div>
      </div>

      {/* Epic Username Warning */}
      {user && !isProfileComplete && (
        <div className="flex-shrink-0 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <EpicUsernameWarning />
        </div>
      )}

      {/* ===== MAIN CONTENT - 70/30 PREMIUM LAYOUT ===== */}
      <div className="flex-1">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-6">
            
            {/* ===== LEFT COLUMN (70%) - Main Content ===== */}
            <div className="space-y-6">
              
              {/* Status Messages - Full Width */}
              {match.status === 'open' && isCreator && (
                <div className="flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                  <p className="text-base font-medium text-primary">Waiting for opponent to join...</p>
                </div>
              )}

              {match.status === 'completed' && (
                <div className="flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-success/10 via-success/5 to-success/10 border border-success/20">
                  <Trophy className="w-5 h-5 text-success" />
                  <p className="text-base font-medium text-success">
                    {match.result?.winner_user_id === user?.id ? '🎉 Congratulations! You won!' : 'Match Completed'}
                  </p>
                </div>
              )}

              {match.status === 'disputed' && (
                <div className="flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-destructive/10 via-destructive/5 to-destructive/10 border border-destructive/20">
                  <Clock className="w-5 h-5 text-destructive animate-pulse" />
                  <p className="text-base font-medium text-destructive">Under Admin Review - Please wait</p>
                </div>
              )}

              {/* Team Join Section */}
              {showTeamJoin && (
                <Card className="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      Join with Your Team
                    </CardTitle>
                    <CardDescription>
                      Select a team with {match.team_size} accepted members to join this match
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <TeamSelector
                      teamSize={match.team_size}
                      entryFee={match.entry_fee}
                      selectedTeamId={selectedTeam?.id ?? null}
                      onSelectTeam={(team) => setSelectedTeam(team as SelectedTeam | null)}
                      paymentMode={paymentMode}
                    />

                    {selectedTeam && (
                      <PaymentModeSelector
                        paymentMode={paymentMode}
                        onChangePaymentMode={setPaymentMode}
                        entryFee={match.entry_fee}
                        teamSize={match.team_size}
                        memberBalances={selectedTeam.memberBalances}
                        userBalance={wallet?.balance ?? 0}
                      />
                    )}

                    <div className="p-4 rounded-xl bg-secondary/50 border border-border/50 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Team Cost</span>
                        <CoinDisplay amount={totalTeamCost} size="md" />
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Payment Mode</span>
                        <span className="font-medium">{paymentMode === 'cover' ? 'You pay all' : 'Split between members'}</span>
                      </div>
                    </div>

                    <Button
                      size="lg"
                      className="w-full h-12 text-base font-semibold"
                      onClick={handleJoinWithTeam}
                      disabled={joining || !canJoinWithTeam}
                    >
                      {joining ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        'Join Match with Team'
                      )}
                    </Button>

                    {selectedTeam && !canJoinWithTeam && (
                      <p className="text-sm text-destructive text-center">
                        Insufficient balance for selected payment mode
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ===== TEAMS VS CARD - Large & Premium ===== */}
              <TeamParticipantsDisplay match={match} currentUserId={user?.id} />

              {/* ===== PROOF SCREENSHOTS - Large Section ===== */}
              {user && isParticipant && (
                <ProofSection
                  matchId={match.id}
                  currentUserId={user.id}
                  isAdmin={isAdmin}
                  isParticipant={isParticipant}
                />
              )}

              {/* ===== GAME RULES - Collapsible ===== */}
              <GameRulesPanel />

              {/* Action Buttons - Cancel/Leave */}
              {(canCancel || canLeave) && (
                <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-secondary/30 border border-border/30">
                  {canCancel && (
                    <Button
                      variant="destructive"
                      onClick={handleCancelMatch}
                      disabled={canceling}
                      className="gap-2"
                    >
                      {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Cancel Match
                    </Button>
                  )}

                  {canLeave && (
                    <Button
                      variant="outline"
                      onClick={handleLeaveMatch}
                      disabled={leaving}
                      className="gap-2"
                    >
                      {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Leave Match
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ===== RIGHT COLUMN (30%) - Sidebar ===== */}
            <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              
              {/* Ready Up Section */}
              {showReadyUp && user && (
                <ReadyUpSection
                  match={match}
                  currentUserId={user.id}
                  onReadyChange={fetchMatch}
                />
              )}

              {/* Result Declaration - Large & Premium */}
              {showResultDeclaration && user && (
                <TeamResultDeclaration
                  match={match}
                  currentUserId={user.id}
                  onResultDeclared={fetchMatch}
                />
              )}

              {/* Match Chat - Full Height */}
              {showChat && user && (
                <div className="h-[500px] lg:h-[calc(100vh-300px)] min-h-[400px] max-h-[700px]">
                  <MatchChat
                    matchId={match.id}
                    matchStatus={match.status}
                    currentUserId={user.id}
                    isAdmin={isAdmin}
                    isParticipant={isParticipant}
                  />
                </div>
              )}

              {/* Match Info Card - When no chat */}
              {!showChat && (
                <Card className="bg-gradient-to-br from-card via-card to-secondary/20 border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Timer className="w-4 h-4 text-accent" />
                      Match Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">Players</span>
                      <span className="font-medium">{participantCount}/{maxParticipants}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">Entry Fee</span>
                      <CoinDisplay amount={match.entry_fee} size="sm" />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-sm text-muted-foreground">Prize Pool</span>
                      <CoinDisplay amount={prizePool} size="sm" className="text-accent" />
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">Created</span>
                      <span className="text-sm">{formatDistanceToNow(new Date(match.created_at), { addSuffix: true })}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
