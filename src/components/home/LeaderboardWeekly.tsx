import { useState, useEffect } from 'react';
import { Trophy, Medal, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

const rankIcons = [
  { icon: Trophy, color: 'text-yellow-400' },
  { icon: Medal, color: 'text-gray-400' },
  { icon: Award, color: 'text-amber-600' },
];

export function LeaderboardWeekly() {
  const [entries, setEntries] = useState<WeeklyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeeklyLeaderboard = async () => {
      // Try weekly view first, fallback to regular leaderboard
      const { data, error } = await supabase
        .from('leaderboard_weekly')
        .select('*')
        .limit(10);

      if (!error && data && data.length > 0) {
        setEntries(data as WeeklyEntry[]);
      } else {
        // Fallback to regular leaderboard if no weekly data
        const { data: fallbackData } = await supabase
          .from('leaderboard')
          .select('user_id, username, avatar_url, total_earnings')
          .order('total_earnings', { ascending: false })
          .limit(10);
        
        if (fallbackData) {
          setEntries(fallbackData.map(e => ({
            user_id: e.user_id || '',
            username: e.username || '',
            avatar_url: e.avatar_url,
            weekly_earned: Number(e.total_earnings) || 0,
          })));
        }
      }
      setLoading(false);
    };

    fetchWeeklyLeaderboard();
  }, []);

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Top Players This Week
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="flex-1 h-4" />
                  <Skeleton className="w-16 h-4" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No activity this week. Be the first!
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, index) => {
                const RankIcon = rankIcons[index]?.icon;
                const rankColor = rankIcons[index]?.color;

                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-secondary/50 cursor-pointer',
                      index < 3 && 'bg-secondary/30'
                    )}
                    onClick={() => setSelectedUserId(entry.user_id)}
                  >
                    {/* Rank */}
                    <div className="w-7 text-center">
                      {RankIcon ? (
                        <RankIcon className={cn('w-5 h-5 mx-auto', rankColor)} />
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">
                          #{index + 1}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={entry.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {entry.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name */}
                    <p className="flex-1 font-medium truncate text-sm">{entry.username}</p>

                    {/* Earnings */}
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
