import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal, Award, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { PlayerStatsModal } from '@/components/player/PlayerStatsModal';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface WeeklyEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  weekly_earned: number;
}

const rankConfig = [
  { icon: Trophy, color: 'text-yellow-400', bg: 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10', ring: 'ring-yellow-500/30' },
  { icon: Medal, color: 'text-gray-300', bg: 'bg-gradient-to-r from-gray-400/20 to-gray-500/10', ring: 'ring-gray-400/30' },
  { icon: Award, color: 'text-amber-600', bg: 'bg-gradient-to-r from-amber-600/20 to-amber-700/10', ring: 'ring-amber-600/30' },
];

export function LeaderboardCompact() {
  const [entries, setEntries] = useState<WeeklyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeeklyLeaderboard = async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_weekly', {
        p_limit: 5,
      });

      if (!error && data && data.length > 0) {
        setEntries(data as WeeklyEntry[]);
      } else {
        const { data: fallbackData } = await supabase.rpc('get_leaderboard', {
          p_limit: 5,
          p_offset: 0,
        });
        
        if (fallbackData) {
          setEntries(fallbackData.map(e => ({
            user_id: (e as any).user_id || '',
            username: (e as any).username || '',
            avatar_url: (e as any).avatar_url,
            weekly_earned: Number((e as any).total_earnings) || 0,
          })));
        }
      }
      setLoading(false);
    };

    fetchWeeklyLeaderboard();
  }, []);

  return (
    <>
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden card-glass">
        <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border/50">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <div className="relative">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <div className="absolute inset-0 w-5 h-5 bg-yellow-400/30 blur-md rounded-full" />
              </div>
              <span>Top This Week</span>
            </span>
            <Button variant="ghost" size="sm" asChild className="text-xs group">
              <Link to="/leaderboard" className="flex items-center gap-1">
                View All
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="flex-1 h-4" />
                  <Skeleton className="w-16 h-4" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-6">
              <Trophy className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-center text-muted-foreground text-sm">
                No activity this week. Be the first!
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry, index) => {
                const config = rankConfig[index];
                const RankIcon = config?.icon;

                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 cursor-pointer group',
                      'hover:bg-secondary/60',
                      config?.bg,
                      index < 3 && 'ring-1 ring-inset',
                      config?.ring
                    )}
                    onClick={() => setSelectedUserId(entry.user_id)}
                  >
                    <div className="w-7 text-center flex-shrink-0">
                      {RankIcon ? (
                        <RankIcon className={cn('w-5 h-5 mx-auto', config?.color)} />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">
                          #{index + 1}
                        </span>
                      )}
                    </div>

                    <Avatar className={cn(
                      "w-9 h-9 flex-shrink-0 ring-2 ring-offset-1 ring-offset-background transition-all",
                      index < 3 ? config?.ring : "ring-border/50",
                      "group-hover:ring-primary/50"
                    )}>
                      <AvatarImage src={entry.avatar_url ?? undefined} className="object-cover" />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary font-semibold">
                        {entry.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <p className="flex-1 font-medium truncate text-sm group-hover:text-primary transition-colors">
                      {entry.username}
                    </p>

                    <CoinDisplay amount={entry.weekly_earned} size="sm" showSign />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PlayerStatsModal
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
        userId={selectedUserId || ''}
      />
    </>
  );
}
