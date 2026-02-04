import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useChallenges } from '@/hooks/useChallenges';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function ProgressCard() {
  const { user } = useAuth();
  const { userXp, isLoading } = useChallenges();
  
  const nextAvatarCost = 500;
  const progress = Math.min((userXp / nextAvatarCost) * 100, 100);
  const xpNeeded = Math.max(0, nextAvatarCost - userXp);
  const canAfford = userXp >= nextAvatarCost;

  if (!user) {
    return (
      <Card className={cn(
        "p-4 bg-gradient-to-r from-primary/8 via-card to-accent/8",
        "border-primary/20 hover:border-primary/40 transition-colors"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Complete Challenges</p>
              <p className="text-xs text-muted-foreground">Earn XP and unlock avatars</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="hover-lift">
            <Link to="/auth?next=/challenges">Sign In</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-4 lg:p-5 transition-all duration-300",
      canAfford 
        ? "bg-gradient-to-r from-accent/15 via-card to-accent/15 border-accent/30 glow-gold-soft"
        : "bg-gradient-to-r from-primary/8 via-card to-accent/8 border-primary/20"
    )}>
      <div className="flex items-center gap-4 lg:gap-5">
        {/* XP Badge */}
        <div className="flex-shrink-0">
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center border-2 transition-all",
            canAfford 
              ? "bg-accent/20 border-accent/50 animate-pulse-soft glow-gold-soft"
              : "bg-accent/10 border-accent/30"
          )}>
            <span className={cn(
              "text-lg font-bold font-mono",
              canAfford ? "text-accent" : "text-accent/80"
            )}>
              {isLoading ? '...' : userXp}
            </span>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-1">XP</p>
        </div>

        {/* Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Your Progress</p>
            <span className="text-xs">
              {canAfford ? (
                <span className="text-success font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Avatar available!
                </span>
              ) : (
                <span className="text-muted-foreground">{xpNeeded} XP to go</span>
              )}
            </span>
          </div>
          <div className="relative">
            <Progress value={progress} className="h-2.5" />
            {canAfford && (
              <div className="absolute inset-0 bg-accent/20 rounded-full animate-pulse" />
            )}
          </div>
        </div>

        {/* CTA */}
        <Button 
          variant={canAfford ? "gold" : "outline"} 
          size="sm" 
          asChild 
          className={cn(
            "gap-1 group",
            canAfford && "glow-gold"
          )}
        >
          <Link to="/challenges">
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Shop</span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
