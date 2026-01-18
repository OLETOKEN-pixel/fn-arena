import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, XCircle, Loader2, Clock } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MatchStatusBadge, RegionBadge, PlatformBadge, ModeBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { ReadyUpSection } from '@/components/matches/ReadyUpSection';
import { ResultDeclaration } from '@/components/matches/ResultDeclaration';
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

  return (
    <MainLayout showChat={false}>
      <div className="max-w-4xl mx-auto space-y-6">
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

        {/* Match Header */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={match.creator?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {match.creator?.username?.charAt(0).toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{match.creator?.username}</p>
                  <p className="text-sm text-muted-foreground">Host</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <MatchStatusBadge status={match.status} />
                <p className="text-xs text-muted-foreground">
                  Created {formatDistanceToNow(new Date(match.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Game & Mode */}
            <div className="flex flex-wrap gap-2">
              <ModeBadge mode={match.mode} />
              <RegionBadge region={match.region} />
              <PlatformBadge platform={match.platform} />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Entry Fee</p>
                <CoinDisplay amount={match.entry_fee} size="lg" />
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Match Size</p>
                <p className="text-xl font-bold">{match.team_size}v{match.team_size}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Prize Pool</p>
                <CoinDisplay amount={match.entry_fee * maxParticipants * 0.95} size="lg" />
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">First to</p>
                <p className="text-xl font-bold">{match.first_to}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Players</p>
                <p className="text-xl font-bold">{participantCount}/{maxParticipants}</p>
              </div>
            </div>

            {/* Status Messages */}
            {match.status === 'open' && isCreator && (
              <div className="text-center py-4 rounded-lg bg-primary/10 text-primary">
                <Users className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">Waiting for opponent...</p>
                <p className="text-sm text-muted-foreground">Your match is live and visible to others</p>
              </div>
            )}

            {match.status === 'completed' && (
              <div className="text-center py-4 rounded-lg bg-success/10 text-success">
                <Trophy className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">Match Completed</p>
                {match.result?.winner_user_id === user?.id ? (
                  <p className="text-sm">Congratulations! You won!</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Better luck next time!</p>
                )}
              </div>
            )}

            {match.status === 'disputed' && (
              <div className="text-center py-4 rounded-lg bg-destructive/10 text-destructive">
                <Clock className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">Under Admin Review</p>
                <p className="text-sm text-muted-foreground">
                  {match.result?.dispute_reason || 'Results conflict - awaiting resolution'}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            {canCancel && (
              <Button
                variant="destructive"
                className="w-full"
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
                className="w-full"
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

        {/* Result Declaration */}
        {showResultDeclaration && user && (
          <ResultDeclaration
            match={match}
            currentUserId={user.id}
            onResultDeclared={fetchMatch}
          />
        )}

        {/* Participants */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participants ({participantCount}/{maxParticipants})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {match.participants && match.participants.length > 0 ? (
              <div className="space-y-3">
                {match.participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{p.profile?.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.profile?.epic_username ?? 'Epic username not set'}
                      </p>
                    </div>
                    {p.team_side && (
                      <span className="text-xs text-muted-foreground">
                        Team {p.team_side}
                      </span>
                    )}
                    {match.result?.winner_user_id === p.user_id && (
                      <Trophy className="w-5 h-5 text-warning" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No participants yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
