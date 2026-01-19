import { useState, useEffect } from 'react';
import { Trophy, Target, TrendingUp, Coins, Calendar, Gift, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVipStatus } from '@/hooks/useVipStatus';
import { TipModal } from '@/components/vip/TipModal';
import { cn } from '@/lib/utils';

interface PlayerStats {
  user_id: string;
  username: string;
  avatar_url: string | null;
  epic_username: string | null;
  total_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_earned: number;
  total_profit: number;
  avg_profit_per_match: number;
  member_since: string;
}

interface PlayerStatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function PlayerStatsModal({ open, onOpenChange, userId }: PlayerStatsModalProps) {
  const { user } = useAuth();
  const { isVip } = useVipStatus();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTipModal, setShowTipModal] = useState(false);

  useEffect(() => {
    if (open && userId) {
      fetchStats();
    }
  }, [open, userId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_player_stats', { p_user_id: userId });
      if (!error && data && typeof data === 'object' && !Array.isArray(data)) {
        setStats(data as unknown as PlayerStats);
      }
    } catch (e) {
      console.error('Error fetching player stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  const canTip = user && user.id !== userId && isVip;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>Player Statistics</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            </div>
          ) : stats ? (
            <div className="space-y-5">
              {/* Player Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={stats.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                      {stats.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold">{stats.username}</h3>
                    {stats.epic_username && (
                      <p className="text-sm text-muted-foreground">Epic: {stats.epic_username}</p>
                    )}
                  </div>
                </div>
                {canTip && (
                  <Button size="sm" variant="outline" onClick={() => setShowTipModal(true)}>
                    <Gift className="w-4 h-4 mr-1" /> Tip
                  </Button>
                )}
              </div>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="financial">Financial</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  {/* Performance */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={Target}
                      label="Win Rate"
                      value={`${stats.win_rate}%`}
                      color="text-primary"
                    />
                    <StatCard
                      icon={Trophy}
                      label="Total Matches"
                      value={stats.total_matches.toString()}
                      color="text-warning"
                    />
                    <StatCard
                      icon={Trophy}
                      label="Wins"
                      value={stats.wins.toString()}
                      color="text-success"
                    />
                    <StatCard
                      icon={X}
                      label="Losses"
                      value={stats.losses.toString()}
                      color="text-destructive"
                    />
                  </div>

                  {/* Member Since */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Member since</span>
                    <span className="font-medium ml-auto">{formatDate(stats.member_since)}</span>
                  </div>
                </TabsContent>

                <TabsContent value="financial" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={Coins}
                      label="Total Earned"
                      value={<CoinDisplay amount={stats.total_earned} size="sm" />}
                      color="text-warning"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Total Profit"
                      value={<CoinDisplay amount={stats.total_profit} size="sm" showSign />}
                      color={stats.total_profit >= 0 ? 'text-success' : 'text-destructive'}
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Avg per Match"
                      value={<CoinDisplay amount={stats.avg_profit_per_match} size="sm" showSign />}
                      color={stats.avg_profit_per_match >= 0 ? 'text-success' : 'text-destructive'}
                    />
                    <StatCard
                      icon={Trophy}
                      label="Matches Played"
                      value={stats.total_matches.toString()}
                      color="text-muted-foreground"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Player not found</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Tip Modal */}
      {stats && (
        <TipModal
          open={showTipModal}
          onOpenChange={setShowTipModal}
          recipientId={userId}
          recipientUsername={stats.username}
          recipientAvatarUrl={stats.avatar_url ?? undefined}
        />
      )}
    </>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  label: string; 
  value: React.ReactNode; 
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 text-center">
      <Icon className={cn('w-5 h-5 mx-auto mb-1', color)} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
