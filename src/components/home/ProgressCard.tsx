import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useChallenges } from '@/hooks/useChallenges';
import { useAuth } from '@/contexts/AuthContext';

export function ProgressCard() {
  const { user } = useAuth();
  const { userXp, isLoading } = useChallenges();
  
  const nextAvatarCost = 500;
  const progress = Math.min((userXp / nextAvatarCost) * 100, 100);
  const xpNeeded = Math.max(0, nextAvatarCost - userXp);

  if (!user) {
    return (
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Complete Challenges</p>
              <p className="text-xs text-muted-foreground">Earn XP and unlock avatars</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/auth?next=/challenges">Sign In</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
      <div className="flex items-center gap-4">
        {/* XP Badge */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center border-2 border-accent/50">
            <span className="text-lg font-bold text-accent">
              {isLoading ? '...' : userXp}
            </span>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-1">XP</p>
        </div>

        {/* Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">Your Progress</p>
            <span className="text-xs text-muted-foreground">
              {userXp >= nextAvatarCost ? (
                <span className="text-success">Avatar disponibile!</span>
              ) : (
                `${xpNeeded} XP needed`
              )}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* CTA */}
        <Button 
          variant={userXp >= nextAvatarCost ? "default" : "outline"} 
          size="sm" 
          asChild 
          className={userXp >= nextAvatarCost ? "glow-blue" : ""}
        >
          <Link to="/challenges" className="flex items-center gap-1">
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Avatar Shop</span>
          </Link>
        </Button>
      </div>
    </Card>
  );
}
