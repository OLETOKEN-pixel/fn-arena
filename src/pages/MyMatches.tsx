import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MyMatchCard } from '@/components/matches/MyMatchCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Match, MatchStatus } from '@/types';

type StatusFilter = 'all' | 'active' | 'completed';

export default function MyMatches() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  useEffect(() => {
    if (!user && !authLoading) {
      navigate(`/auth?next=${encodeURIComponent(location.pathname)}`);
      return;
    }

    if (!user) return;

    const fetchMyMatches = async () => {
      setLoading(true);

      // First get match IDs where user is participant
      const { data: participantData, error: participantError } = await supabase
        .from('match_participants')
        .select('match_id')
        .eq('user_id', user.id);

      if (participantError || !participantData?.length) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const matchIds = participantData.map(p => p.match_id);

      // Fetch matches with all details
      let query = supabase
        .from('matches')
        .select(`
          *,
          creator:profiles_public!matches_creator_id_fkey(user_id, username, avatar_url, epic_username),
          participants:match_participants(
            *,
            profile:profiles_public(user_id, username, avatar_url, epic_username)
          ),
          result:match_results(*)
        `)
        .in('id', matchIds)
        .not('status', 'eq', 'open'); // Exclude open matches (those are visible in /matches)

      const { data, error } = await query;

      if (!error && data) {
        // Sort: active matches first, then by date
        const sorted = (data as unknown as Match[]).sort((a, b) => {
          const activeStatuses: MatchStatus[] = ['ready_check', 'in_progress', 'result_pending', 'disputed'];
          const aActive = activeStatuses.includes(a.status);
          const bActive = activeStatuses.includes(b.status);
          
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setMatches(sorted);
      }
      setLoading(false);
    };

    fetchMyMatches();
  }, [user, authLoading, navigate, location.pathname]);

  // Filter matches based on status
  const activeStatuses: MatchStatus[] = ['ready_check', 'in_progress', 'result_pending', 'disputed', 'full'];
  const completedStatuses: MatchStatus[] = ['completed', 'admin_resolved', 'canceled', 'finished'];

  const filteredMatches = matches.filter(match => {
    if (statusFilter === 'active') return activeStatuses.includes(match.status);
    if (statusFilter === 'completed') return completedStatuses.includes(match.status);
    return true;
  });

  // Count matches requiring action
  const actionRequiredCount = matches.filter(match => {
    const participant = match.participants?.find(p => p.user_id === user?.id);
    if (!participant) return false;
    
    if ((match.status === 'ready_check' || match.status === 'full') && !participant.ready) return true;
    if ((match.status === 'in_progress' || match.status === 'result_pending') && !participant.result_choice) return true;
    
    return false;
  }).length;

  if (authLoading) return <MainLayout><Skeleton className="h-96" /></MainLayout>;
  if (!user) return null;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Gamepad2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">My Matches</h1>
              <p className="text-muted-foreground">
                Your active and past matches
                {actionRequiredCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                    {actionRequiredCount} action required
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button asChild className="glow-blue">
            <Link to="/matches">
              Browse Matches
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="active" className="relative">
                Active
                {matches.filter(m => activeStatuses.includes(m.status)).length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                    {matches.filter(m => activeStatuses.includes(m.status)).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={statusFilter} className="mt-4">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-[280px] rounded-lg" />
                ))}
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="text-center py-12">
                <Gamepad2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {statusFilter === 'active' 
                    ? 'No active matches' 
                    : statusFilter === 'completed'
                    ? 'No completed matches yet'
                    : 'No matches found'}
                </p>
                <Button asChild>
                  <Link to="/matches">Find a Match</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMatches.map((match) => (
                  <MyMatchCard 
                    key={match.id} 
                    match={match} 
                    currentUserId={user.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
