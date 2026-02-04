import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Gamepad2, AlertCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MyMatchCard } from '@/components/matches/MyMatchCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/use-mobile';
import type { Match, MatchStatus } from '@/types';

type StatusFilter = 'all' | 'active' | 'completed';

export default function MyMatches() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const isDesktop = useIsDesktop();
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

  const activeCount = matches.filter(m => activeStatuses.includes(m.status)).length;

  if (authLoading) return <MainLayout><Skeleton className="h-96" /></MainLayout>;
  if (!user) return null;

  return (
    <MainLayout>
      <div className="space-y-6 lg:space-y-8">
        {/* Header - Bigger on desktop */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 lg:gap-6">
          <div className="flex items-center gap-4 lg:gap-5">
            <div className={cn(
              "rounded-xl lg:rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center",
              "w-14 h-14 lg:w-16 lg:h-16"
            )}>
              <Gamepad2 className="w-7 h-7 lg:w-8 lg:h-8 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl lg:text-4xl font-bold">My Matches</h1>
              <div className="flex items-center gap-2 lg:gap-3 text-muted-foreground mt-1">
                <span className="lg:text-lg">Your active and past matches</span>
                {actionRequiredCount > 0 && (
                  <span className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-destructive/20 text-destructive rounded-full animate-pulse",
                    isDesktop && "px-3 py-1.5 text-sm"
                  )}>
                    <AlertCircle className="w-3 h-3 lg:w-4 lg:h-4" />
                    {actionRequiredCount} action required
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button 
            asChild 
            className={cn(
              "glow-blue btn-premium",
              isDesktop && "h-12 px-6 text-base font-bold"
            )}
          >
            <Link to="/matches">
              Browse Matches
            </Link>
          </Button>
        </div>

        {/* Tabs - Bigger on desktop */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList className={cn(
              "bg-card/60 backdrop-blur-sm",
              isDesktop && "h-12 p-1.5"
            )}>
              <TabsTrigger 
                value="active" 
                className={cn(
                  "relative gap-2 data-[state=active]:bg-primary/20",
                  isDesktop && "h-9 px-5 text-base"
                )}
              >
                Active
                {activeCount > 0 && (
                  <span className={cn(
                    "px-2 py-0.5 text-xs rounded-full",
                    statusFilter === 'active' 
                      ? "bg-primary/30 text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {activeCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="completed" 
                className={cn(
                  "data-[state=active]:bg-primary/20",
                  isDesktop && "h-9 px-5 text-base"
                )}
              >
                Completed
              </TabsTrigger>
              <TabsTrigger 
                value="all" 
                className={cn(
                  "data-[state=active]:bg-primary/20",
                  isDesktop && "h-9 px-5 text-base"
                )}
              >
                All
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={statusFilter} className="mt-6 lg:mt-8">
            {loading ? (
              <div className={cn(
                "grid grid-cols-1 md:grid-cols-2 gap-4",
                isDesktop && "lg:grid-cols-3 lg:gap-5"
              )}>
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-[300px] lg:h-[340px] rounded-xl lg:rounded-2xl skeleton-premium" />
                ))}
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="text-center py-16 lg:py-24">
                <div className={cn(
                  "mx-auto mb-4 lg:mb-6 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center",
                  "w-20 h-20 lg:w-28 lg:h-28"
                )}>
                  <Gamepad2 className="w-9 h-9 lg:w-14 lg:h-14 text-primary/60" />
                </div>
                <h3 className="font-semibold text-lg lg:text-2xl mb-2 lg:mb-3">
                  {statusFilter === 'active' 
                    ? 'No active matches' 
                    : statusFilter === 'completed'
                    ? 'No completed matches yet'
                    : 'No matches found'}
                </h3>
                <p className="text-muted-foreground mb-6 lg:mb-8 lg:text-lg">
                  {statusFilter === 'active' 
                    ? 'Join a match to get started!'
                    : 'Start competing to build your history'}
                </p>
                <Button 
                  asChild 
                  className={cn(
                    "glow-blue",
                    isDesktop && "h-14 px-8 text-lg font-bold"
                  )}
                >
                  <Link to="/matches">Find a Match</Link>
                </Button>
              </div>
            ) : (
              <div className={cn(
                "grid grid-cols-1 md:grid-cols-2 gap-4",
                isDesktop && "lg:grid-cols-3 lg:gap-5"
              )}>
                {filteredMatches.map((match, index) => (
                  <div 
                    key={match.id}
                    className={cn(
                      "animate-card-enter",
                      `stagger-${Math.min(index + 1, 6)}`
                    )}
                  >
                    <MyMatchCard 
                      match={match} 
                      currentUserId={user.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
