import { useState, useEffect } from 'react';
import { Trophy, BarChart3, ChevronDown, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { PlayerStatsModal } from '@/components/player/PlayerStatsModal';
import { PodiumSection } from '@/components/leaderboard/PodiumSection';
import { supabase } from '@/integrations/supabase/client';
import type { LeaderboardEntry } from '@/types';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/use-mobile';

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredEntries = searchQuery
    ? entries.filter(e => e.username?.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const top3 = filteredEntries.slice(0, 3);
  const restEntries = filteredEntries.slice(3);

  return (
    <MainLayout>
      <div className="space-y-6 lg:space-y-8">
        {/* Header + Search */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 lg:gap-6">
          <div>
            <h1 className="font-display text-2xl lg:text-4xl font-bold flex items-center gap-3 lg:gap-4">
              <div className="relative">
                <Trophy className="w-7 h-7 lg:w-10 lg:h-10 text-yellow-400" />
                <div className="absolute inset-0 bg-yellow-400/30 blur-xl rounded-full" />
              </div>
              Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base mt-1">
              All-time top players ranked by coins won
            </p>
          </div>
          
          {/* Search */}
          <div className="relative w-full lg:w-[360px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-background/50 h-11 lg:h-12"
            />
          </div>
        </div>

        {loading && page === 1 ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="w-[200px] h-[280px] rounded-2xl skeleton-premium" />
              ))}
            </div>
            <div className="space-y-2">
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-xl skeleton-premium" />
              ))}
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <p className="text-muted-foreground text-lg">
              No players on the leaderboard yet. Start competing!
            </p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium - Desktop only gets premium animation, mobile gets simplified */}
            {top3.length >= 3 && !searchQuery && (
              isDesktop ? (
                <PodiumSection entries={top3} onSelectUser={setSelectedUserId} />
              ) : (
                /* Mobile: simple top 3 cards */
                <div className="grid grid-cols-3 gap-3">
                  {top3.map((entry, index) => (
                    <div
                      key={entry.id}
                      className="flex flex-col items-center p-3 rounded-xl bg-secondary/50 border border-border/50 cursor-pointer"
                      onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                    >
                      <div className={cn(
                        'text-xs font-bold mb-2 px-2 py-0.5 rounded-full',
                        index === 0 && 'bg-yellow-500/20 text-yellow-400',
                        index === 1 && 'bg-gray-400/20 text-gray-300',
                        index === 2 && 'bg-amber-600/20 text-amber-500'
                      )}>
                        #{index + 1}
                      </div>
                      <Avatar className="w-10 h-10 mb-1">
                        <AvatarImage src={entry.avatar_url ?? undefined} />
                        <AvatarFallback>{entry.username?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="text-xs font-medium truncate w-full text-center">{entry.username}</p>
                      <CoinDisplay amount={Number(entry.total_earnings)} size="sm" />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Rankings List */}
            <Card className="card-glass overflow-hidden">
              <CardHeader className="border-b border-border/50 py-4 lg:py-5">
                <CardTitle className="flex items-center gap-3 text-lg lg:text-xl">
                  <BarChart3 className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                  Rankings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop: Header row */}
                {isDesktop && (
                  <div className="hidden lg:grid grid-cols-[80px_1fr_120px_160px_120px] gap-4 px-6 py-3 border-b border-border/30 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    <span>Rank</span>
                    <span>Player</span>
                    <span className="text-center">Wins</span>
                    <span className="text-center">Coins Won</span>
                    <span className="text-right">Action</span>
                  </div>
                )}

                <div className="divide-y divide-border/30">
                  {(searchQuery ? filteredEntries : restEntries).map((entry, index) => {
                    const displayRank = searchQuery ? index + 1 : index + 4;

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center gap-4 lg:grid lg:grid-cols-[80px_1fr_120px_160px_120px] lg:gap-4',
                          'p-4 lg:px-6 lg:py-5 transition-all duration-200 cursor-pointer group',
                          'hover:bg-secondary/40'
                        )}
                        onClick={() => entry.user_id && setSelectedUserId(entry.user_id)}
                      >
                        {/* Rank */}
                        <div className="w-10 lg:w-auto text-center">
                          <span className="text-lg lg:text-xl font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                            #{displayRank}
                          </span>
                        </div>

                        {/* Avatar + Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className={cn(
                            "w-11 h-11 lg:w-12 lg:h-12 ring-2 ring-offset-2 ring-offset-background ring-border/30",
                            "group-hover:ring-primary/40 transition-all"
                          )}>
                            <AvatarImage src={entry.avatar_url ?? undefined} className="object-cover" />
                            <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                              {entry.username?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-semibold text-base lg:text-lg truncate group-hover:text-primary transition-colors">
                            {entry.username}
                          </p>
                        </div>

                        {/* Wins */}
                        <div className="hidden lg:flex items-center justify-center">
                          <div className="flex items-center gap-1.5">
                            <Trophy className="w-4 h-4 text-muted-foreground" />
                            <span className="font-mono font-bold text-base">{entry.wins}</span>
                          </div>
                        </div>

                        {/* Coins - always visible */}
                        <div className="lg:flex lg:justify-center">
                          <CoinDisplay amount={Number(entry.total_earnings)} size={isDesktop ? 'md' : 'sm'} />
                        </div>

                        {/* Mobile: wins inline */}
                        <div className="lg:hidden text-xs text-muted-foreground">
                          {entry.wins}W
                        </div>

                        {/* Stats Button - Desktop */}
                        <div className="hidden lg:flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover-lift h-9 px-4 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              entry.user_id && setSelectedUserId(entry.user_id);
                            }}
                          >
                            View Stats
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Load More */}
                {hasMore && !searchQuery && (
                  <div className="p-6 lg:p-8 text-center border-t border-border/30">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={loadMore}
                      disabled={loading}
                      className="hover-lift h-11 lg:h-12 px-8"
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
              </CardContent>
            </Card>
          </>
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
