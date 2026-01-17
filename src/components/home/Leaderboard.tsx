import { useState, useEffect } from 'react';
import { Trophy, Medal, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { supabase } from '@/integrations/supabase/client';
import type { LeaderboardEntry } from '@/types';
import { cn } from '@/lib/utils';

const rankIcons = [
  { icon: Trophy, color: 'text-yellow-400' },
  { icon: Medal, color: 'text-gray-400' },
  { icon: Award, color: 'text-amber-600' },
];

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(10);

      if (!error && data) {
        setEntries(data as LeaderboardEntry[]);
      }
      setLoading(false);
    };

    fetchLeaderboard();
  }, []);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Top Players (Month)
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
            No players yet. Be the first to compete!
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => {
              const RankIcon = rankIcons[index]?.icon;
              const rankColor = rankIcons[index]?.color;

              return (
                <div 
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    index < 3 && 'bg-secondary/50'
                  )}
                >
                  {/* Rank */}
                  <div className="w-8 text-center">
                    {RankIcon ? (
                      <RankIcon className={cn('w-5 h-5 mx-auto', rankColor)} />
                    ) : (
                      <span className="text-muted-foreground font-medium">
                        #{index + 1}
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={entry.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {entry.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name & Stats */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.wins} wins / {entry.total_matches} matches
                    </p>
                  </div>

                  {/* Earnings */}
                  <CoinDisplay amount={Number(entry.total_earnings)} size="sm" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
