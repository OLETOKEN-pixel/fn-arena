import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, XCircle, Loader2, Clock, Share2, Gamepad2 } from 'lucide-react';
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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar - Fixed */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <Link
            to={match.status === 'open' ? '/matches' : '/my-matches'}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{match.status === 'open' ? 'Back to Matches' : 'Back to My Matches'}</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 text-accent" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">
                    {match.team_size}v{match.team_size} {match.mode}
                  </span>
                  <MatchStatusBadge status={match.status} />
                </div>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={copyMatchLink}>
            <Share2 className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Copy Link</span>
          </Button>
        </div>
      </div>

      {/* Epic Username Warning */}
      {user && !isProfileComplete && (
        <div className="flex-shrink-0 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <EpicUsernameWarning />
        </div>
      )}

      {/* Main Content - 3 Column Fixed Layout */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-[1800px] mx-auto p-4">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr,minmax(320px,400px),minmax(280px,320px)] gap-4">
            
            {/* LEFT COLUMN - Match Info + Teams */}
            <div className="flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-thin">
              {/* Match Header Card - Compact */}
              <Card className="flex-shrink-0 bg-gradient-to-br from-card via-card to-secondary/20 border-border">
                <CardContent className="p-3">
                  {/* Info Badges Row */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <RegionBadge region={match.region} />
                    <PlatformBadge platform={match.platform} />
                    
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-xs">
                      <span className="text-muted-foreground">Entry:</span>
                      <CoinDisplay amount={match.entry_fee} size="sm" />
                    </div>
                    
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-accent/10 border border-accent/20 text-xs">
                      <span className="text-accent font-semibold">Prize:</span>
                      <CoinDisplay amount={prizePool} size="sm" className="text-accent" />
                    </div>

                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-xs">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{participantCount}/{maxParticipants}</span>
                    </div>

                    <span className="text-xs text-muted-foreground">
                      FT{match.first_to} • {formatDistanceToNow(new Date(match.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Progress Stepper */}
                  <MatchProgressStepper status={match.status} />

                  {/* Status Messages */}
                  {match.status === 'open' && isCreator && (
                    <div className="flex items-center justify-center gap-2 py-2 mt-2 rounded bg-primary/10 border border-primary/20">
                      <Users className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium text-primary">Waiting for opponent...</p>
                    </div>
                  )}

                  {match.status === 'completed' && (
                    <div className="flex items-center justify-center gap-2 py-2 mt-2 rounded bg-success/10 border border-success/20">
                      <Trophy className="w-4 h-4 text-success" />
                      <p className="text-sm font-medium text-success">
                        {match.result?.winner_user_id === user?.id ? 'You won!' : 'Match Completed'}
                      </p>
                    </div>
                  )}

                  {match.status === 'disputed' && (
                    <div className="flex items-center justify-center gap-2 py-2 mt-2 rounded bg-destructive/10 border border-destructive/20">
                      <Clock className="w-4 h-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">Under Admin Review</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {(canCancel || canLeave) && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                      {canCancel && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleCancelMatch}
                          disabled={canceling}
                        >
                          {canceling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                          Cancel Match
                        </Button>
                      )}

                      {canLeave && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLeaveMatch}
                          disabled={leaving}
                        >
                          {leaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                          Leave Match
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team Join Section */}
              {showTeamJoin && (
                <Card className="flex-shrink-0 bg-card border-border border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="w-5 h-5 text-primary" />
                      Join with Your Team
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Select a team with {match.team_size} members
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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

                    <div className="p-3 rounded-lg bg-secondary space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Team Cost:</span>
                        <CoinDisplay amount={totalTeamCost} size="sm" />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Payment:</span>
                        <span>{paymentMode === 'cover' ? 'You pay all' : 'Split'}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleJoinWithTeam}
                      disabled={joining || !canJoinWithTeam}
                    >
                      {joining ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        'Join with Team'
                      )}
                    </Button>

                    {selectedTeam && !canJoinWithTeam && (
                      <p className="text-xs text-destructive text-center">
                        Insufficient balance
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Participants Display */}
              <div className="flex-shrink-0">
                <TeamParticipantsDisplay match={match} currentUserId={user?.id} />
              </div>
            </div>

            {/* MIDDLE COLUMN - Actions (Ready Up / Result / Proof) */}
            <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin">
              {/* Ready Up Section */}
              {showReadyUp && user && (
                <ReadyUpSection
                  match={match}
                  currentUserId={user.id}
                  onReadyChange={fetchMatch}
                />
              )}

              {/* Result Declaration */}
              {showResultDeclaration && user && (
                <TeamResultDeclaration
                  match={match}
                  currentUserId={user.id}
                  onResultDeclared={fetchMatch}
                />
              )}

              {/* Proof Screenshots Section */}
              {user && isParticipant && (
                <ProofSection
                  matchId={match.id}
                  currentUserId={user.id}
                  isAdmin={isAdmin}
                  isParticipant={isParticipant}
                />
              )}

              {/* Game Rules - Compact */}
              <GameRulesPanel />
            </div>

            {/* RIGHT COLUMN - Chat */}
            {showChat && user && (
              <div className="h-full min-h-0">
                <MatchChat
                  matchId={match.id}
                  matchStatus={match.status}
                  currentUserId={user.id}
                  isAdmin={isAdmin}
                  isParticipant={isParticipant}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
