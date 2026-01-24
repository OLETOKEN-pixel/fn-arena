import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useChallenges } from '@/hooks/useChallenges';
import { useAvatarShop } from '@/hooks/useAvatarShop';
import { ChallengeCard } from '@/components/challenges/ChallengeCard';
import { ChallengeCountdown } from '@/components/challenges/ChallengeCountdown';
import { AvatarGrid } from '@/components/avatars/AvatarGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Zap, Calendar, Star, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Challenges() {
  const { user, loading: authLoading } = useAuth();
  const {
    dailyChallenges,
    weeklyChallenges,
    userXp,
    isLoading,
    claimChallenge,
    isClaiming,
    getResetTimes,
  } = useChallenges();

  const {
    avatars,
    isLoading: avatarsLoading,
    purchaseAvatar,
    equipAvatar,
    isPurchasing,
    isEquipping,
  } = useAvatarShop();

  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'shop'>('daily');

  const resetTimes = useMemo(() => getResetTimes(), [getResetTimes]);

  // Stats
  const dailyCompleted = dailyChallenges.filter((c) => c.is_claimed).length;
  const weeklyCompleted = weeklyChallenges.filter((c) => c.is_claimed).length;
  const dailyTotal = dailyChallenges.length;
  const weeklyTotal = weeklyChallenges.length;
  const ownedAvatarsCount = avatars.filter((a) => a.is_owned).length;

  if (!authLoading && !user) {
    return <Navigate to="/auth?next=/challenges" replace />;
  }

  return (
    <MainLayout>
      <div className="min-h-screen pb-8">
        {/* Header */}
        <div className="bg-gradient-to-b from-card/80 to-transparent border-b border-border/50 px-4 py-6 mb-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-accent" />
                  Challenges
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete challenges to earn XP and Coins
                </p>
              </div>

              {/* XP Badge */}
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="px-3 py-1.5 text-sm font-semibold">
                  <Zap className="w-4 h-4 mr-1.5 text-accent" />
                  {userXp.toLocaleString()} XP
                </Badge>
              </div>
            </div>

            {/* Countdown timers */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <ChallengeCountdown
                targetDate={resetTimes.dailyReset}
                label="Daily reset"
              />
              <ChallengeCountdown
                targetDate={resetTimes.weeklyReset}
                label="Weekly reset"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'daily' | 'weekly' | 'shop')}
            className="space-y-6"
          >
            <TabsList className="grid w-full max-w-lg grid-cols-3 mx-auto">
              <TabsTrigger value="daily" className="gap-2">
                <Calendar className="w-4 h-4" />
                Daily
                <Badge
                  variant="secondary"
                  className={cn(
                    'ml-1 text-xs',
                    dailyCompleted === dailyTotal && dailyTotal > 0 && 'bg-primary/20 text-primary'
                  )}
                >
                  {dailyCompleted}/{dailyTotal}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="weekly" className="gap-2">
                <Star className="w-4 h-4" />
                Weekly
                <Badge
                  variant="secondary"
                  className={cn(
                    'ml-1 text-xs',
                    weeklyCompleted === weeklyTotal && weeklyTotal > 0 && 'bg-primary/20 text-primary'
                  )}
                >
                  {weeklyCompleted}/{weeklyTotal}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="shop" className="gap-2">
                <ShoppingBag className="w-4 h-4" />
                Shop
                <Badge variant="secondary" className="ml-1 text-xs">
                  {ownedAvatarsCount}/{avatars.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Daily Tab */}
            <TabsContent value="daily" className="mt-6">
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))}
                </div>
              ) : dailyChallenges.length === 0 ? (
                <EmptyState type="daily" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dailyChallenges.map((challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onClaim={claimChallenge}
                      isClaiming={isClaiming}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Weekly Tab */}
            <TabsContent value="weekly" className="mt-6">
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))}
                </div>
              ) : weeklyChallenges.length === 0 ? (
                <EmptyState type="weekly" />
              ) : (
                <>
                  {/* Weekly coin cap notice */}
                  <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm">
                    <span className="font-medium text-accent">Weekly Coin Cap:</span>{' '}
                    <span className="text-muted-foreground">
                      Max 1 Coin per week. Complete all challenges for XP bonus!
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {weeklyChallenges.map((challenge) => (
                      <ChallengeCard
                        key={challenge.id}
                        challenge={challenge}
                        onClaim={claimChallenge}
                        isClaiming={isClaiming}
                      />
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Shop Tab */}
            <TabsContent value="shop" className="mt-6">
              <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm">
                <span className="font-medium text-accent">Avatar Shop:</span>{' '}
                <span className="text-muted-foreground">
                  Usa i tuoi XP per sbloccare nuovi avatar. Hai {userXp.toLocaleString()} XP disponibili.
                </span>
              </div>

              <AvatarGrid
                avatars={avatars}
                userXp={userXp}
                onPurchase={purchaseAvatar}
                onEquip={equipAvatar}
                isPurchasing={isPurchasing}
                isEquipping={isEquipping}
                isLoading={avatarsLoading}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}

function EmptyState({ type }: { type: 'daily' | 'weekly' }) {
  return (
    <div className="text-center py-12 px-4">
      <Trophy className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-semibold">No {type} challenges</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Check back later for new challenges
      </p>
    </div>
  );
}
