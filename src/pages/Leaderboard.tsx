import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, BarChart3, ChevronDown, Calendar, Filter } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { PlayerStatsModal } from '@/components/player/PlayerStatsModal';
import { supabase } from '@/integrations/supabase/client';
import type { LeaderboardEntry } from '@/types';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/use-mobile';

const rankConfig = [
  { icon: Trophy, color: 'text-yellow-400', bg: 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10', ring: 'ring-yellow-500/30' },
  { icon: Medal, color: 'text-gray-300', bg: 'bg-gradient-to-r from-gray-400/20 to-gray-500/10', ring: 'ring-gray-400/30' },
  { icon: Award, color: 'text-amber-600', bg: 'bg-gradient-to-r from-amber-600/20 to-amber-700/10', ring: 'ring-amber-600/30' },
];

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const PAGE_SIZE = 25;

  useEffect(() => {
    fetchLeaderboard(1);
  }, []);

  const fetchLeaderboard = async (pageNum: number) => {
    setLoading(true);
    const from = (pageNum - 1) * PAGE_SIZE;
    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_limit: PAGE_SIZE,
      p_offset: from,
    });

    if (!error && data) {
      if (pageNum === 1) {
        setEntries(data as LeaderboardEntry[]);
      } else {
        setEntries(prev => [...prev, ...(data as LeaderboardEntry[])]);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(nextPage);
  };

  return (
    <MainLayout>
      <div className="space-y-6 lg:space-y-8">
        {/* Header - Bigger on desktop */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl lg:text-4xl font-bold flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <Trophy className="w-7 h-7 lg:w-10 lg:h-10 text-yellow-400" />
                <div className="absolute inset-0 bg-yellow-400/30 blur-lg lg:blur-xl rounded-full" />
              </div>
              Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base mt-1">All-time top players ranked by earnings</p>
          </div>
        </div>

        {/* Desktop: 2-column layout with filters panel */}
        {isDesktop ? (
          <div className="grid grid-cols-[1fr_320px] gap-8 items-start">
            {/* Main Leaderboard Table */}
            <Card className="card-glass">
              <CardHeader className="border-b border-border/50 py-5">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <BarChart3 className="w-6 h-6 text-primary" />
                  Rankings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading && page === 1 ? (
                  <div className="space-y-2 p-6">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="flex items-center gap-5 p-4">
                        <Skeleton className="w-10 h-10" />
                        <Skeleton className="w-14 h-14 rounded-full" />
                        <Skeleton className="flex-1 h-6" />
                        <Skeleton className="w-28 h-6" />
                        <Skeleton className="w-24 h-10" />
                      </div>
                    ))}
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-20">
                    <Trophy className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
                    <p className="text-muted-foreground text-lg">
                      No players on the leaderboard yet. Start competing!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {entries.map((entry, index) => {
                      const config = rankConfig[index];
                      const RankIcon = config?.icon;

                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            'flex items-center gap-5 p-5 transition-all duration-200 cursor-pointer group',
                            'hover:bg-secondary/50',
                            config?.bg,
                            index < 3 && 'ring-1 ring-inset',
                            config?.ring,
                            index === 0 && "animate-card-enter stagger-1",
                            index === 1 && "animate-card-enter stagger-2",
                            index === 2 && "animate-card-enter stagger-3"
                          )}
                          onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                        >
                          {/* Rank - Bigger */}
                          <div className="w-14 text-center">
                            {RankIcon ? (
                              <div className="relative inline-block">
                                <RankIcon className={cn('w-9 h-9 mx-auto', config?.color)} />
                                {index === 0 && (
                                  <div className="absolute inset-0 w-9 h-9 bg-yellow-400/20 blur-lg rounded-full mx-auto" />
                                )}
                              </div>
                            ) : (
                              <span className="text-xl font-bold text-muted-foreground">
                                #{index + 1}
                              </span>
                            )}
                          </div>

                          {/* Avatar - Bigger */}
                          <Avatar className={cn(
                            "w-14 h-14 ring-2 ring-offset-2 ring-offset-background transition-all",
                            index < 3 ? config?.ring : "ring-border/50",
                            "group-hover:ring-primary/50"
                          )}>
                            <AvatarImage src={entry.avatar_url ?? undefined} className="object-cover" />
                            <AvatarFallback className="bg-primary/20 text-primary font-semibold text-lg">
                              {entry.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          {/* Name & Stats */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                              {entry.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {entry.wins} wins / {entry.total_matches} matches
                            </p>
                          </div>

                          {/* Earnings */}
                          <div className="text-right">
                            <CoinDisplay amount={Number(entry.total_earnings)} size="md" />
                          </div>

                          {/* Stats Button */}
                          <Button
                            variant="outline"
                            size="default"
                            className="hover-lift h-11 px-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              entry.user_id && setSelectedUserId(entry.user_id);
                            }}
                          >
                            View Stats
                          </Button>
                        </div>
                      );
                    })}

                    {/* Load More */}
                    {hasMore && (
                      <div className="p-8 text-center">
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={loadMore}
                          disabled={loading}
                          className="hover-lift h-12 px-8"
                        >
                          {loading ? 'Loading...' : (
                            <>
                              <ChevronDown className="w-5 h-5 mr-2" />
                              Load More
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right Panel - Filters & Info */}
            <div className="space-y-6 sticky top-24">
              {/* Season Info Card */}
              <Card className="card-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="w-5 h-5 text-primary" />
                    Current Season
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20">
                    <p className="text-2xl font-bold text-primary">Season 1</p>
                    <p className="text-sm text-muted-foreground mt-1">All-time rankings</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-secondary/50 text-center">
                      <p className="text-2xl font-bold">{entries.length}+</p>
                      <p className="text-xs text-muted-foreground">Players</p>
                    </div>
                    <div className="p-3 rounded-lg bg-secondary/50 text-center">
                      <p className="text-2xl font-bold text-accent">€50K+</p>
                      <p className="text-xs text-muted-foreground">Prize Pool</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="card-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Filter className="w-5 h-5 text-primary" />
                    Filter Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start h-11">
                    <Trophy className="w-4 h-4 mr-2 text-yellow-400" />
                    All-Time
                  </Button>
                  <Button variant="ghost" className="w-full justify-start h-11 text-muted-foreground">
                    <Calendar className="w-4 h-4 mr-2" />
                    This Week
                  </Button>
                  <Button variant="ghost" className="w-full justify-start h-11 text-muted-foreground">
                    <Calendar className="w-4 h-4 mr-2" />
                    This Month
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* Mobile: Single column */
          <Card className="card-glass">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Rankings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading && page === 1 ? (
                <div className="space-y-2 p-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-3">
                      <Skeleton className="w-8 h-8" />
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <Skeleton className="flex-1 h-5" />
                      <Skeleton className="w-24 h-5" />
                      <Skeleton className="w-20 h-8" />
                    </div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-16">
                  <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">
                    No players on the leaderboard yet. Start competing!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {entries.map((entry, index) => {
                    const config = rankConfig[index];
                    const RankIcon = config?.icon;

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center gap-4 p-4 transition-all duration-200 cursor-pointer group',
                          'hover:bg-secondary/50',
                          config?.bg,
                          index < 3 && 'ring-1 ring-inset',
                          config?.ring
                        )}
                        onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                      >
                        <div className="w-12 text-center">
                          {RankIcon ? (
                            <RankIcon className={cn('w-7 h-7 mx-auto', config?.color)} />
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                          )}
                        </div>

                        <Avatar className="w-11 h-11 ring-2 ring-offset-2 ring-offset-background">
                          <AvatarImage src={entry.avatar_url ?? undefined} />
                          <AvatarFallback>{entry.username?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{entry.username}</p>
                          <p className="text-xs text-muted-foreground">{entry.wins} wins</p>
                        </div>

                        <CoinDisplay amount={Number(entry.total_earnings)} size="sm" />

                        <Button variant="outline" size="sm">Stats</Button>
                      </div>
                    );
                  })}

                  {hasMore && (
                    <div className="p-6 text-center">
                      <Button variant="outline" onClick={loadMore} disabled={loading}>
                        {loading ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <PlayerStatsModal
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
        userId={selectedUserId || ''}
      />
    </MainLayout>
  );
}
