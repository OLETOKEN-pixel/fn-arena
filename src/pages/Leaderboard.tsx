import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, BarChart3, ChevronDown } from 'lucide-react';
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
      <div className="space-y-6">
        {/* Page content - container handled by MainLayout for 1920×1080 */}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-bold flex items-center gap-3">
              <div className="relative">
                <Trophy className="w-7 h-7 lg:w-8 lg:h-8 text-yellow-400" />
                <div className="absolute inset-0 bg-yellow-400/30 blur-lg rounded-full" />
              </div>
              Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base">All-time top players ranked by earnings</p>
          </div>
        </div>

        {/* Leaderboard Card */}
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
                        config?.ring,
                        index === 0 && "animate-card-enter stagger-1",
                        index === 1 && "animate-card-enter stagger-2",
                        index === 2 && "animate-card-enter stagger-3"
                      )}
                      onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                    >
                      {/* Rank */}
                      <div className="w-12 text-center">
                        {RankIcon ? (
                          <div className="relative inline-block">
                            <RankIcon className={cn('w-7 h-7 mx-auto', config?.color)} />
                            {index === 0 && (
                              <div className="absolute inset-0 w-7 h-7 bg-yellow-400/20 blur-md rounded-full mx-auto" />
                            )}
                          </div>
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground">
                            #{index + 1}
                          </span>
                        )}
                      </div>

                      {/* Avatar */}
                      <Avatar className={cn(
                        "w-11 h-11 ring-2 ring-offset-2 ring-offset-background transition-all",
                        index < 3 ? config?.ring : "ring-border/50",
                        "group-hover:ring-primary/50"
                      )}>
                        <AvatarImage src={entry.avatar_url ?? undefined} className="object-cover" />
                        <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                          {entry.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name & Stats */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">
                          {entry.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.wins} wins / {entry.total_matches} matches
                        </p>
                      </div>

                      {/* Earnings */}
                      <div className="text-right">
                        <CoinDisplay amount={Number(entry.total_earnings)} size="sm" />
                      </div>

                      {/* Stats Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="hover-lift"
                        onClick={(e) => {
                          e.stopPropagation();
                          entry.user_id && setSelectedUserId(entry.user_id);
                        }}
                      >
                        Stats
                      </Button>
                    </div>
                  );
                })}

                {/* Load More */}
                {hasMore && (
                  <div className="p-6 text-center">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={loading}
                      className="hover-lift"
                    >
                      {loading ? 'Loading...' : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-2" />
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
      </div>

      {/* Player Stats Modal */}
      <PlayerStatsModal
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
        userId={selectedUserId || ''}
      />
    </MainLayout>
  );
}
