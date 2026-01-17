import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, Clock, Trophy, AlertTriangle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MatchStatusBadge, RegionBadge, PlatformBadge, ModeBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/types';

export default function MatchDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, wallet, isProfileComplete, refreshWallet } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
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
          description: 'Match not found',
          variant: 'destructive',
        });
        navigate('/matches');
        return;
      }

      setMatch(data as unknown as Match);
      setLoading(false);
    };

    fetchMatch();
  }, [id, navigate, toast]);

  const handleJoin = async () => {
    if (!user || !match || !wallet) return;

    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile',
        description: 'Add your Epic Games Username before joining matches.',
        variant: 'destructive',
      });
      return;
    }

    if (wallet.balance < match.entry_fee) {
      toast({
        title: 'Insufficient balance',
        description: 'You need more Coins to join this match.',
        variant: 'destructive',
      });
      navigate('/buy');
      return;
    }

    setJoining(true);

    try {
      // Lock coins
      const { error: walletError } = await supabase
        .from('wallets')
        .update({
          balance: wallet.balance - match.entry_fee,
          locked_balance: wallet.locked_balance + match.entry_fee,
        })
        .eq('user_id', user.id);

      if (walletError) throw walletError;

      // Add transaction
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'lock',
        amount: match.entry_fee,
        description: `Joined match ${match.id}`,
        match_id: match.id,
      });

      // Join match
      const { error: joinError } = await supabase
        .from('match_participants')
        .insert({
          match_id: match.id,
          user_id: user.id,
        });

      if (joinError) throw joinError;

      // Check if match is now full
      const participantCount = (match.participants?.length ?? 0) + 1;
      const maxParticipants = match.team_size * 2;

      if (participantCount >= maxParticipants) {
        await supabase
          .from('matches')
          .update({ status: 'full' })
          .eq('id', match.id);
      }

      toast({
        title: 'Joined!',
        description: 'You have joined the match successfully.',
      });

      await refreshWallet();
      window.location.reload();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to join match. Please try again.',
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
  const isFull = participantCount >= maxParticipants;
  const isCreator = user?.id === match.creator_id;
  const isParticipant = match.participants?.some(p => p.user_id === user?.id);
  const canJoin = match.status === 'open' && !isFull && !isCreator && !isParticipant && user;

  return (
    <MainLayout showChat={false}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <Link
          to="/matches"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Matches
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
              <MatchStatusBadge status={match.status} />
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Entry Fee</p>
                <CoinDisplay amount={match.entry_fee} size="lg" />
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

            {/* Timer */}
            {match.status === 'open' && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">Expires in:</span>
                <CountdownTimer expiresAt={match.expires_at} />
              </div>
            )}

            {/* Join Button */}
            {canJoin && (
              <Button
                size="lg"
                className="w-full glow-blue"
                onClick={handleJoin}
                disabled={joining || !isProfileComplete}
              >
                {joining ? 'Joining...' : `Join Match (${match.entry_fee} Coins)`}
              </Button>
            )}

            {isParticipant && (
              <div className="text-center py-4 rounded-lg bg-success/10 text-success">
                <Trophy className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">You're in this match!</p>
              </div>
            )}

            {isCreator && (
              <div className="text-center py-4 rounded-lg bg-primary/10 text-primary">
                <Users className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">You created this match</p>
              </div>
            )}
          </CardContent>
        </Card>

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
                    <div>
                      <p className="font-medium">{p.profile?.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.profile?.epic_username ?? 'Epic username not set'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No participants yet. Be the first to join!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
