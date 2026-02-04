import { useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useChallenges } from '@/hooks/useChallenges';
import { useAvatarShop } from '@/hooks/useAvatarShop';
import { ChallengeCard } from '@/components/challenges/ChallengeCard';
import { ChallengeCountdown } from '@/components/challenges/ChallengeCountdown';
import { AvatarGrid } from '@/components/avatars/AvatarGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Zap, Calendar, Star, ShoppingBag, Sparkles, ArrowRight } from 'lucide-react';
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
  const canAffordAvatar = userXp >= 500;
  const xpNeeded = Math.max(0, 500 - userXp);

  if (!authLoading && !user) {
    return <Navigate to="/auth?next=/challenges" replace />;
  }

  return (
    <MainLayout>
      <div className="pb-8">
        {/* Header - container handled by MainLayout */}
        <div className="bg-gradient-to-b from-card/80 to-transparent border-b border-border/50 py-6 mb-6 -mx-4 lg:-mx-0 px-4 lg:px-0">
          <div>
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

              {/* XP Badge - Larger and more prominent */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/30">
                  <Sparkles className="w-5 h-5 text-accent" />
                  <span className="text-lg font-bold text-accent">{userXp.toLocaleString()} XP</span>
                </div>
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

        {/* AVATAR SHOP HERO BANNER - Always visible */}
        <div className="mb-6">
          <div 
            className={cn(
              "relative overflow-hidden rounded-2xl p-5 border transition-all",
              canAffordAvatar 
                ? "bg-gradient-to-r from-accent/20 via-primary/10 to-accent/20 border-accent/40 glow-gold"
                : "bg-gradient-to-r from-primary/10 via-card to-primary/10 border-primary/30"
            )}
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />

            <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar previews */}
                <div className="flex -space-x-3">
                  {avatars.slice(0, 3).map((avatar, i) => (
                    <div 
                      key={avatar.id}
                      className="w-12 h-12 rounded-full overflow-hidden border-2 border-background shadow-lg"
                      style={{ zIndex: 3 - i }}
                    >
                      <img 
                        src={avatar.image_url} 
                        alt="Avatar" 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                  {avatars.length > 3 && (
                    <div className="w-12 h-12 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium">
                      +{avatars.length - 3}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-accent" />
                    Avatar Shop
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {canAffordAvatar ? (
                      <span className="text-success font-medium">Hai XP sufficienti per un nuovo avatar!</span>
                    ) : (
                      <>Ti mancano <span className="text-accent font-medium">{xpNeeded} XP</span> per il prossimo avatar</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Owned count */}
                <Badge variant="secondary" className="px-3 py-1.5">
                  {ownedAvatarsCount}/{avatars.length + 1} posseduti
                </Badge>

                <Button 
                  onClick={() => setActiveTab('shop')} 
                  className={cn(
                    canAffordAvatar && "glow-blue animate-pulse"
                  )}
                >
                  Apri Shop
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content - container handled by MainLayout */}
        <div>
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
              <TabsTrigger 
                value="shop" 
                className={cn(
                  "gap-2",
                  canAffordAvatar && "ring-2 ring-accent/50"
                )}
              >
                <ShoppingBag className="w-4 h-4" />
                Shop
                {canAffordAvatar && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
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
              <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium text-accent">Avatar Shop:</span>{' '}
                  <span className="text-muted-foreground">
                    Usa i tuoi XP per sbloccare nuovi avatar.
                  </span>
                </div>
                <Badge variant="secondary" className="px-3 py-1">
                  <Sparkles className="w-3 h-3 mr-1 text-accent" />
                  {userXp.toLocaleString()} XP
                </Badge>
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

              {/* Profile Avatar Link */}
              <div className="mt-6 p-4 rounded-xl bg-card border border-border text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Gestisci i tuoi avatar acquistati dal profilo
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/profile">
                    Vai al Profilo
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
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
