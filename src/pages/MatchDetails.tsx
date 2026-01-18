import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, XCircle, Loader2, Clock, Share2, Gamepad2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MatchStatusBadge, RegionBadge, PlatformBadge, ModeBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { ReadyUpSection } from '@/components/matches/ReadyUpSection';
import { TeamResultDeclaration } from '@/components/matches/TeamResultDeclaration';
import { TeamParticipantsDisplay } from '@/components/matches/TeamParticipantsDisplay';
import { MatchProgressStepper } from '@/components/matches/MatchProgressStepper';
import { GameRulesPanel } from '@/components/matches/GameRulesPanel';
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
        creator:profiles!matches_creator_id_fkey(*),
        participants:match_participants(
          *,
          profile:profiles(*)
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
      if (!isParticipant) {
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

  if (loading) return <MainLayout><LoadingPage /></MainLayout>;
  if (!match) return null;
  const participantCount = match.participants?.length ?? 0;
  const maxParticipants = match.team_size * 2;
  const isCreator = user?.id === match.creator_id;
  const participant = match.participants?.find(p => p.user_id === user?.id);
  const isParticipant = !!participant;
  
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

  return (
    <MainLayout showChat={false}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back button */}
        <Link
          to={match.status === 'open' ? '/matches' : '/my-matches'}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {match.status === 'open' ? 'Back to Matches' : 'Back to My Matches'}
        </Link>

        {/* Epic Username Warning */}
        {user && !isProfileComplete && <EpicUsernameWarning />}

        {/* Premium Match Header */}
        <Card className="bg-gradient-to-br from-card via-card to-secondary/20 border-border overflow-hidden">
          <CardContent className="p-6">
            {/* Top Row - Date & Status */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                Created {formatDistanceToNow(new Date(match.created_at), { addSuffix: true })}
              </p>
              <MatchStatusBadge status={match.status} />
            </div>

            {/* Title Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Gamepad2 className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold font-display">
                    {match.team_size}v{match.team_size} {match.mode}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-medium">
                      FN
                    </span>
                    <span className="text-sm text-muted-foreground">
                      First to {match.first_to}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={copyMatchLink}>
                <Share2 className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            </div>

            {/* Info Badges Row */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <RegionBadge region={match.region} />
              <PlatformBadge platform={match.platform} />
              
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm">
                <span className="text-muted-foreground">Entry:</span>
                <CoinDisplay amount={match.entry_fee} size="sm" />
              </div>
              
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-sm">
                <span className="text-accent font-semibold">Prize:</span>
                <CoinDisplay amount={prizePool} size="sm" className="text-accent" />
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{participantCount}/{maxParticipants}</span>
              </div>
            </div>

            {/* Status Messages */}
            {match.status === 'open' && isCreator && (
              <div className="text-center py-4 rounded-lg bg-primary/10 border border-primary/20">
                <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="font-medium text-primary">Waiting for opponent...</p>
                <p className="text-sm text-muted-foreground">Your match is live and visible to others</p>
              </div>
            )}

            {match.status === 'completed' && (
              <div className="text-center py-4 rounded-lg bg-success/10 border border-success/20">
                <Trophy className="w-6 h-6 mx-auto mb-2 text-success" />
                <p className="font-medium text-success">Match Completed</p>
                {match.result?.winner_user_id === user?.id ? (
                  <p className="text-sm">Congratulations! You won!</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Better luck next time!</p>
                )}
              </div>
            )}

            {match.status === 'disputed' && (
              <div className="text-center py-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <Clock className="w-6 h-6 mx-auto mb-2 text-destructive" />
                <p className="font-medium text-destructive">Under Admin Review</p>
                <p className="text-sm text-muted-foreground">
                  {match.result?.dispute_reason || 'Results conflict - awaiting resolution'}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mt-4">
              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={handleCancelMatch}
                  disabled={canceling}
                >
                  {canceling ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Cancel Match
                </Button>
              )}

              {canLeave && (
                <Button
                  variant="outline"
                  onClick={handleLeaveMatch}
                  disabled={leaving}
                >
                  {leaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Leave Match
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress Stepper */}
        <Card className="bg-card/50 border-border">
          <CardContent className="py-4">
            <MatchProgressStepper status={match.status} />
          </CardContent>
        </Card>

        {/* Team Join Section */}
        {showTeamJoin && (
          <Card className="bg-card border-border border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Join with Your Team
              </CardTitle>
              <CardDescription>
                Select a team with exactly {match.team_size} members to join this {match.team_size}v{match.team_size} match
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

              <div className="p-4 rounded-lg bg-secondary space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Fee (per player):</span>
                  <CoinDisplay amount={match.entry_fee} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Team Cost ({match.team_size} players):</span>
                  <CoinDisplay amount={totalTeamCost} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment:</span>
                  <span>{paymentMode === 'cover' ? 'You pay all' : 'Split between members'}</span>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full glow-blue"
                onClick={handleJoinWithTeam}
                disabled={joining || !canJoinWithTeam}
              >
                {joining ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join with this Team'
                )}
              </Button>

              {selectedTeam && !canJoinWithTeam && (
                <p className="text-sm text-destructive text-center">
                  {paymentMode === 'cover' 
                    ? `Insufficient balance. You need ${totalTeamCost} Coins.`
                    : 'Some team members have insufficient balance.'}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ready Up Section */}
        {showReadyUp && user && (
          <ReadyUpSection
            match={match}
            currentUserId={user.id}
            onReadyChange={fetchMatch}
          />
        )}

        {/* Result Declaration - Captain Only for Team Matches */}
        {showResultDeclaration && user && (
          <TeamResultDeclaration
            match={match}
            currentUserId={user.id}
            onResultDeclared={fetchMatch}
          />
        )}

        {/* Main Content: Teams + Rules */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
          {/* Participants - Team vs Team Display */}
          <TeamParticipantsDisplay match={match} currentUserId={user?.id} />
          
          {/* Game Rules Panel */}
          <GameRulesPanel />
        </div>
      </div>
    </MainLayout>
  );
}
