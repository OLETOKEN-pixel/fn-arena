import { useState, useEffect } from 'react';
import { BarChart3, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface PlayerStats {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_earned: number;
  total_profit: number;
  member_since: string;
}

interface PlayerComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUsername: string;
  targetAvatarUrl?: string | null;
}

export function PlayerComparisonModal({
  open,
  onOpenChange,
  targetUserId,
  targetUsername,
  targetAvatarUrl,
}: PlayerComparisonModalProps) {
  const { user, profile } = useAuth();
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [targetStats, setTargetStats] = useState<PlayerStats | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [targetRank, setTargetRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && user && targetUserId) {
      fetchStats();
    }
  }, [open, user, targetUserId]);

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch both stats and ranks in parallel
      // Cast to any for newly created RPCs not yet in generated types
      const rpc = supabase.rpc as any;
      const [myStatsRes, targetStatsRes, myRankRes, targetRankRes] = await Promise.all([
        supabase.rpc('get_player_stats', { p_user_id: user.id }),
        supabase.rpc('get_player_stats', { p_user_id: targetUserId }),
        rpc('get_player_rank', { p_user_id: user.id }),
        rpc('get_player_rank', { p_user_id: targetUserId }),
      ]);

      if (myStatsRes.data && typeof myStatsRes.data === 'object') {
        setMyStats(myStatsRes.data as unknown as PlayerStats);
      }
      if (targetStatsRes.data && typeof targetStatsRes.data === 'object') {
        setTargetStats(targetStatsRes.data as unknown as PlayerStats);
      }
      if (myRankRes.data) {
        setMyRank(Number(myRankRes.data));
      }
      if (targetRankRes.data) {
        setTargetRank(Number(targetRankRes.data));
      }
    } catch (e) {
      console.error('Error fetching comparison stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const getDifference = (myVal: number, theirVal: number, higherIsBetter = true) => {
    const diff = myVal - theirVal;
    if (diff === 0) return { value: 0, isPositive: null };
    const isPositive = higherIsBetter ? diff > 0 : diff < 0;
    return { value: diff, isPositive };
  };

  const formatDiff = (diff: number, suffix = '') => {
    if (diff === 0) return `0${suffix}`;
    return `${diff > 0 ? '+' : ''}${diff.toFixed(suffix === '%' ? 1 : 2)}${suffix}`;
  };

  const metrics = myStats && targetStats ? [
    {
      label: 'Win Rate',
      my: `${myStats.win_rate}%`,
      target: `${targetStats.win_rate}%`,
      diff: getDifference(myStats.win_rate, targetStats.win_rate),
      format: (d: number) => formatDiff(d, '%'),
    },
    {
      label: 'Total Profit',
      my: <CoinDisplay amount={myStats.total_profit} size="sm" showSign />,
      target: <CoinDisplay amount={targetStats.total_profit} size="sm" showSign />,
      diff: getDifference(myStats.total_profit, targetStats.total_profit),
      format: (d: number) => formatDiff(d),
    },
    {
      label: 'Total Wins',
      my: myStats.wins.toString(),
      target: targetStats.wins.toString(),
      diff: getDifference(myStats.wins, targetStats.wins),
      format: (d: number) => formatDiff(d),
    },
    {
      label: 'Total Losses',
      my: myStats.losses.toString(),
      target: targetStats.losses.toString(),
      diff: getDifference(myStats.losses, targetStats.losses, false),
      format: (d: number) => formatDiff(d),
    },
    {
      label: 'Total Matches',
      my: myStats.total_matches.toString(),
      target: targetStats.total_matches.toString(),
      diff: getDifference(myStats.total_matches, targetStats.total_matches),
      format: (d: number) => formatDiff(d),
    },
    {
      label: 'Global Rank',
      my: myRank ? `#${myRank}` : '—',
      target: targetRank ? `#${targetRank}` : '—',
      diff: myRank && targetRank ? getDifference(targetRank, myRank) : { value: 0, isPositive: null },
      format: (d: number) => formatDiff(d),
    },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Player Comparison
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="flex justify-around">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="w-16 h-16 rounded-full" />
            </div>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : myStats && targetStats ? (
          <div className="space-y-5">
            {/* Avatars Row */}
            <div className="flex items-center justify-around py-4 bg-secondary/30 rounded-lg">
              <div className="text-center">
                <Avatar className="w-14 h-14 mx-auto border-2 border-primary/50">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                    {profile?.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="mt-2 font-semibold text-sm">{profile?.username}</p>
                <p className="text-xs text-muted-foreground">You</p>
              </div>

              <div className="text-2xl font-bold text-muted-foreground">VS</div>

              <div className="text-center">
                <Avatar className="w-14 h-14 mx-auto border-2 border-accent/50">
                  <AvatarImage src={targetAvatarUrl ?? undefined} />
                  <AvatarFallback className="bg-accent text-accent-foreground font-bold">
                    {targetUsername?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="mt-2 font-semibold text-sm">{targetUsername}</p>
                <p className="text-xs text-muted-foreground">Target</p>
              </div>
            </div>

            {/* Metrics Table */}
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground font-medium px-2 pb-2 border-b border-border">
                <span>Metric</span>
                <span className="text-center">You</span>
                <span className="text-center">Target</span>
                <span className="text-right">Diff</span>
              </div>

              {/* Rows */}
              {metrics.map((m, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-2 items-center py-2 px-2 rounded-lg hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-center text-sm">{m.my}</span>
                  <span className="text-center text-sm">{m.target}</span>
                  <div className="flex items-center justify-end gap-1">
                    {m.diff.isPositive === null ? (
                      <Minus className="w-3 h-3 text-muted-foreground" />
                    ) : m.diff.isPositive ? (
                      <TrendingUp className="w-3 h-3 text-success" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-destructive" />
                    )}
                    <span
                      className={cn(
                        'text-sm font-medium',
                        m.diff.isPositive === null
                          ? 'text-muted-foreground'
                          : m.diff.isPositive
                          ? 'text-success'
                          : 'text-destructive'
                      )}
                    >
                      {m.format(m.diff.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            Unable to load comparison data
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
