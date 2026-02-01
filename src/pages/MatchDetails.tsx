import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, XCircle, Loader2, Clock, Share2, Gamepad2, Globe, Monitor, Crosshair, Timer, Coins, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge, MatchStatusBadge, RegionBadge, PlatformBadge } from '@/components/ui/custom-badge';
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
import { SoundSettings } from '@/components/settings/SoundSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSoundNotifications } from '@/hooks/useSoundNotifications';
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
  const { playSound, needsUnlock, unlockAudio } = useSoundNotifications();

  const [isAdmin, setIsAdmin] = useState(false);

  const [match, setMatch] = useState<Match | null>(null);
  // Split initial load from background refresh to avoid full-screen freezes under realtime bursts
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const inflightRef = useRef(false);
  const pendingRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Team join state
  const isJoinMode = searchParams.get('join') === 'true';
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cover');
  const [joining, setJoining] = useState(false);
  const [joining1v1, setJoining1v1] = useState(false);

  const fetchMatch = useCallback(async (opts?: { background?: boolean }) => {
    if (!id) return;
    const background = !!opts?.background;

    // Dedupe inflight to avoid piling up requests under load
    if (inflightRef.current) return;
    inflightRef.current = true;

    if (background) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }

    const t0 = performance.now();

    try {

    // 1) Try participant/admin view (protected)
    // 2) If it returns Access denied, fallback to public view (OPEN-friendly)

    const tryPublicFallback = async () => {
      const rpcStart = performance.now();
      const { data: pubData, error: pubError } = await supabase.rpc('get_match_public_details', {
        p_match_id: id,
      });
      const rpcMs = Math.round(performance.now() - rpcStart);

      if (pubError || !pubData) {
        toast({
          title: 'Error',
          description: 'Match not found or could not be loaded.',
          variant: 'destructive',
        });
        navigate('/matches');
        return;
      }

      const pubResult = pubData as unknown as { success: boolean; error?: string; match?: unknown };
      if (!pubResult.success || !pubResult.match) {
        toast({
          title: 'Error',
          description: pubResult.error || 'Match not found or could not be loaded.',
          variant: 'destructive',
        });
        navigate('/matches');
        return;
      }

      const publicMatch = pubResult.match as Match & {
        participant_count?: number;
        max_participants?: number;
      };

      setMatch(publicMatch);
      setInitialLoading(false);
      setRefreshing(false);

      // eslint-disable-next-line no-console
      console.info('[perf] get_match_public_details', { ms: rpcMs });
    };

       // If not logged in, only public view is possible
       if (!user) {
        await tryPublicFallback();
        return;
      }

      const rpcStart = performance.now();
      const { data, error } = await supabase.rpc('get_match_details', { p_match_id: id });
      const rpcMs = Math.round(performance.now() - rpcStart);

    if (error || !data) {
      toast({
        title: 'Error',
        description: 'Match not found or could not be loaded.',
        variant: 'destructive',
      });
      navigate('/matches');
      return;
    }

    const result = data as unknown as { success: boolean; error?: string; match?: unknown };
    if (!result.success || !result.match) {
      if ((result.error || '').toLowerCase() === 'access denied') {
        await tryPublicFallback();
        return;
      }

      toast({
        title: 'Error',
        description: result.error || 'Match not found or could not be loaded.',
        variant: 'destructive',
      });
      navigate('/matches');
      return;
    }

    const matchData = result.match as Match;

    // Debug: if profiles are missing while match is in a phase where identities should be visible
    try {
      const missingProfiles = (matchData.participants ?? []).filter((p: any) => !p?.profile);
      if (missingProfiles.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('[MatchDetails] participants missing profile data', {
          matchId: id,
          status: matchData.status,
          missingUserIds: missingProfiles.map((p: any) => p.user_id),
        });
      }
    } catch {
      // ignore
    }
    
     // If match is not open, non-participants should not see the full page (admins can spectate).
     if (matchData.status !== 'open') {
       const isParticipant = matchData.participants?.some((p) => p.user_id === user.id);
       if (!isParticipant && !isAdmin) {
        toast({
          title: 'Participants Only',
          description: 'This match is no longer public. Only participants can view it.',
          variant: 'destructive',
        });
        navigate('/matches');
        return;
      }
    }

      setMatch(matchData);
      setInitialLoading(false);
      setRefreshing(false);

      // eslint-disable-next-line no-console
      console.info('[perf] get_match_details', { ms: rpcMs, totalMs: Math.round(performance.now() - t0) });
    } finally {
      inflightRef.current = false;
      // Ensure we never get stuck in a loading state
      setInitialLoading(false);
      setRefreshing(false);
    }
   }, [id, navigate, toast, user, isAdmin]);

  // Admin check (server-side)
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.rpc('is_admin');
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Initial fetch and realtime subscription
  useEffect(() => {
    fetchMatch({ background: false });
    
    // Subscribe to realtime updates for this match
    if (id) {
      const channel = supabase
        .channel(`match-details-${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${id}` },
          () => {
            // Throttle bursts: many events can arrive in <100ms under load
            if (pendingRefetchRef.current) clearTimeout(pendingRefetchRef.current);
            pendingRefetchRef.current = setTimeout(() => fetchMatch({ background: true }), 350);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_participants', filter: `match_id=eq.${id}` },
          () => {
            if (pendingRefetchRef.current) clearTimeout(pendingRefetchRef.current);
            pendingRefetchRef.current = setTimeout(() => fetchMatch({ background: true }), 350);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_results', filter: `match_id=eq.${id}` },
          () => {
            if (pendingRefetchRef.current) clearTimeout(pendingRefetchRef.current);
            pendingRefetchRef.current = setTimeout(() => fetchMatch({ background: true }), 350);
          }
        )
        .subscribe();

      return () => {
        if (pendingRefetchRef.current) {
          clearTimeout(pendingRefetchRef.current);
          pendingRefetchRef.current = null;
        }
        supabase.removeChannel(channel);
      };
    }
  }, [id, fetchMatch]);

  // ========== REALTIME AUDIO NOTIFICATIONS ==========
  // Subscribe to match_events table for instant audio notifications
  useEffect(() => {
    if (!id || !user) return;

    const audioChannel = supabase
      .channel(`match-events-audio-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${id}`,
        },
        (payload) => {
          const event = payload.new as {
            event_type: string;
            target_user_ids: string[];
            actor_user_id: string;
          };

          // Only play sound if current user is a target and not the actor
          if (
            event.target_user_ids?.includes(user.id) &&
            event.actor_user_id !== user.id
          ) {
            // Play notification sound for all match events
            playSound('match_accepted');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(audioChannel);
    };
  }, [id, user, playSound]);

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
      if (selectedTeam.owner_id !== user?.id) {
        toast({
          title: 'Unable to join',
          description: 'Only the team owner can join the match.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.rpc('join_match', {
        p_match_id: match.id,
        p_team_id: selectedTeam.id,
        p_payment_mode: paymentMode,
      });

      if (error) throw error;

      const result = data as
        | { success: boolean; reason_code?: string; message?: string; error?: string }
        | null;

      if (!result?.success) {
        toast({
          title: 'Unable to join',
          description: result?.message || result?.error || 'Failed to join match',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Team Joined!',
        description: 'Your team has joined the match. Get ready!',
      });

      await refreshWallet();
      // Remove join param and refresh
      navigate(`/matches/${match.id}`, { replace: true });
      fetchMatch({ background: true });
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

  const handleJoin1v1 = async () => {
    if (!match || !user || !wallet) return;
    
    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile',
        description: 'Add your Epic Games Username before joining matches.',
        variant: 'destructive',
      });
      navigate('/profile');
      return;
    }

    setJoining1v1(true);
    
    try {
      const { data, error } = await supabase.rpc('join_match', { p_match_id: match.id });
      if (error) throw error;

      const result = data as
        | { success: boolean; reason_code?: string; message?: string; error?: string }
        | null;

      if (!result?.success) {
        toast({
          title: 'Unable to join',
          description: result?.message || result?.error || 'Failed to join match',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Joined!',
        description: 'You have joined the match. Get ready!',
      });

      await refreshWallet();
      fetchMatch({ background: true });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to join match',
        variant: 'destructive',
      });
    } finally {
      setJoining1v1(false);
    }
  };

  if (initialLoading) return <div className="h-screen flex items-center justify-center bg-background"><LoadingPage /></div>;
  if (!match) return null;

  const participantCount =
    match.participants?.length ??
    // public view: injected by get_match_public_details
    ((match as any).participant_count as number | undefined) ??
    0;
  const maxParticipants = match.team_size * 2;
  const isCreator = user?.id === match.creator_id;
  const participant = match.participants?.find(p => p.user_id === user?.id);
  const isParticipant = !!participant;
  const isAdminSpectator = isAdmin && !!user && !isParticipant;
  
  const canCancel = !isAdminSpectator && isCreator && match.status === 'open';
  const canLeave = !isAdminSpectator && isParticipant && !isCreator && match.status === 'ready_check' && !participant?.ready;
  
  const showReadyUp = !isAdminSpectator && match.status === 'ready_check' && isParticipant;
  const showResultDeclaration = !isAdminSpectator && isParticipant && (match.status === 'in_progress' || match.status === 'result_pending');
  
  // Show team join UI for team matches when in join mode
  const showTeamJoin = !isAdminSpectator && isJoinMode && match.status === 'open' && match.team_size > 1 && !isParticipant && user;
  
  // Calculate costs for team join
  const totalTeamCost = match.entry_fee * match.team_size;
  const canAffordCover = wallet && wallet.balance >= totalTeamCost;
  const canAffordSplit = selectedTeam?.memberBalances?.every(m => m.balance >= match.entry_fee) ?? false;
  const canJoinWithTeam = selectedTeam && (paymentMode === 'cover' ? canAffordCover : canAffordSplit);
  
  // Join 1v1 logic
  const canJoin1v1 = !isAdminSpectator && user && match.status === 'open' && match.team_size === 1 && !isParticipant && participantCount < maxParticipants;

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
      {/* ===== COMPACT HEADER BAR ===== */}
      <div className="flex-shrink-0 border-b border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* Left - Back Button */}
            <Link
              to={match.status === 'open' ? '/matches' : '/my-matches'}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="hidden sm:inline text-sm">Back</span>
            </Link>

            {/* Center - Match Title & Info */}
            <div className="flex items-center gap-3 flex-1 justify-center">
               <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
                <Gamepad2 className="w-4 h-4 text-accent" />
                <span className="font-bold text-sm">
                  {match.team_size}v{match.team_size} {match.mode}
                </span>
                <MatchStatusBadge status={match.status} />
                 {isAdminSpectator && (
                   <Badge variant="outline" className="text-[10px] uppercase">
                     ADMIN VIEW
                   </Badge>
                 )}
              </div>

              {/* Entry & Prize - Compact */}
              <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/30 border border-border/30">
                  <span className="text-[10px] uppercase text-muted-foreground">Entry</span>
                  <CoinDisplay amount={match.entry_fee} size="sm" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/10 border border-accent/30">
                  <span className="text-[10px] uppercase text-accent">Prize</span>
                  <CoinDisplay amount={prizePool} size="sm" className="text-accent" />
                </div>
              </div>
            </div>

            {/* Right - Copy Link */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={copyMatchLink}
              className="h-8 px-2"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ===== COMPACT PROGRESS STEPPER ===== */}
      <div className="flex-shrink-0 bg-card/50 border-b border-border/30 py-2">
        <div className="max-w-[900px] mx-auto px-4">
          <MatchProgressStepper status={match.status} />
        </div>
      </div>

      {/* Epic Username Warning - Compact */}
      {user && !isProfileComplete && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <EpicUsernameWarning />
        </div>
      )}

      {/* ===== MAIN CONTENT - FIXED HEIGHT LAYOUT ===== */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[1600px] mx-auto px-4 py-4 h-full">
          <div className="flex flex-col lg:flex-row gap-4 h-full">
            
            {/* ===== LEFT COLUMN - Main Content ===== */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              
              {/* Status Messages - Compact */}
              {match.status === 'open' && isCreator && (
                <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <p className="text-sm font-medium text-primary">Waiting for opponent...</p>
                </div>
              )}

              {match.status === 'completed' && (
                <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-success/10 border border-success/20">
                  <Trophy className="w-4 h-4 text-success" />
                  <p className="text-sm font-medium text-success">
                    {match.result?.winner_user_id === user?.id ? '🎉 You won!' : 'Match Completed'}
                  </p>
                </div>
              )}

              {match.status === 'disputed' && (
                <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <Clock className="w-4 h-4 text-destructive animate-pulse" />
                  <p className="text-sm font-medium text-destructive">Under Admin Review</p>
                </div>
              )}

              {/* Team Join Section - Compact */}
              {showTeamJoin && (
                <Card className="border-primary/30 bg-card">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="w-4 h-4 text-primary" />
                      Join with Your Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4 space-y-3">
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

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleJoinWithTeam}
                      disabled={joining || !canJoinWithTeam}
                    >
                      {joining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Join Match
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* ===== TEAMS VS CARD - Compact ===== */}
              <TeamParticipantsDisplay match={match} currentUserId={user?.id} />

              {/* ===== PROOF SCREENSHOTS - Compact ===== */}
              {user && (isParticipant || isAdmin) && (
                <ProofSection
                  matchId={match.id}
                  currentUserId={user.id}
                  isAdmin={isAdmin}
                  isParticipant={isParticipant}
                />
              )}

              {/* ===== GAME RULES - Compact Accordion ===== */}
              <GameRulesPanel />

              {/* Action Buttons - Cancel/Leave */}
              {(canCancel || canLeave) && (
                <div className="flex gap-2">
                  {canCancel && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancelMatch}
                      disabled={canceling}
                      className="gap-1.5"
                    >
                      {canceling ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Cancel
                    </Button>
                  )}

                  {canLeave && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLeaveMatch}
                      disabled={leaving}
                      className="gap-1.5"
                    >
                      {leaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Leave
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ===== RIGHT COLUMN - Sidebar ===== */}
            <div className="w-full lg:w-[360px] flex flex-col gap-4 flex-shrink-0">
              
              {/* Ready Up Section */}
              {showReadyUp && user && (
                <ReadyUpSection
                  match={match}
                  currentUserId={user.id}
                  onReadyChange={fetchMatch}
                />
              )}

              {/* Result Declaration - Compact */}
              {showResultDeclaration && user && (
                <TeamResultDeclaration
                  match={match}
                  currentUserId={user.id}
                  onResultDeclared={fetchMatch}
                />
              )}

              {/* Match Chat - Fills remaining space */}
              {showChat && user && (
                <div className="flex-1 min-h-[300px] lg:min-h-0">
                  <MatchChat
                    matchId={match.id}
                    matchStatus={match.status}
                    currentUserId={user.id}
                    isAdmin={isAdmin}
                    isParticipant={isParticipant}
                  />
                </div>
              )}

              {/* Join Match for 1v1 - Show in sidebar when match is open and user is not participant */}
              {canJoin1v1 && (
                <Card className="bg-card border-primary/30">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      Join This Match
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Entry Fee</span>
                      <CoinDisplay amount={match.entry_fee} size="sm" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Balance</span>
                      <CoinDisplay amount={wallet?.balance ?? 0} size="sm" />
                    </div>
                    <Button 
                      className="w-full mt-2"
                      size="sm"
                      onClick={handleJoin1v1}
                      disabled={joining1v1 || (wallet?.balance ?? 0) < match.entry_fee}
                    >
                      {joining1v1 ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {(wallet?.balance ?? 0) < match.entry_fee ? 'Insufficient Balance' : 'Join Match'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Match Info Card - When no chat and not join mode */}
              {!showChat && !canJoin1v1 && (
                <Card className="bg-card border-border/50">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-accent" />
                      Match Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Players</span>
                      <span className="font-medium">{participantCount}/{maxParticipants}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Entry</span>
                      <CoinDisplay amount={match.entry_fee} size="sm" />
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Prize</span>
                      <CoinDisplay amount={prizePool} size="sm" className="text-accent" />
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
