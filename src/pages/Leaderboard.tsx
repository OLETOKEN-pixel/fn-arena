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

const rankIcons = [
  { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { icon: Medal, color: 'text-gray-400', bg: 'bg-gray-400/10' },
  { icon: Award, color: 'text-amber-600', bg: 'bg-amber-600/10' },
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3">
              <Trophy className="w-8 h-8 text-yellow-400" />
              Leaderboard
            </h1>
            <p className="text-muted-foreground">All-time top players ranked by earnings</p>
          </div>
        </div>

        {/* Leaderboard Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Rankings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && page === 1 ? (
              <div className="space-y-3">
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
              <p className="text-center text-muted-foreground py-12">
                No players on the leaderboard yet. Start competing!
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, index) => {
                  const RankIcon = rankIcons[index]?.icon;
                  const rankColor = rankIcons[index]?.color;
                  const rankBg = rankIcons[index]?.bg;

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        'flex items-center gap-4 p-3 rounded-lg transition-colors hover:bg-secondary/50 cursor-pointer',
                        index < 3 && rankBg
                      )}
                      onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                    >
                      {/* Rank */}
                      <div className="w-10 text-center">
                        {RankIcon ? (
                          <RankIcon className={cn('w-6 h-6 mx-auto', rankColor)} />
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground">
                            #{index + 1}
                          </span>
                        )}
                      </div>

                      {/* Avatar */}
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={entry.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {entry.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{entry.username}</p>
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
                  <div className="pt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={loading}
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
