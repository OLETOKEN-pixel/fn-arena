import { Link } from 'react-router-dom';
import { Wallet, ArrowRight, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function WalletSnapshot() {
  const { user, wallet } = useAuth();

  if (!user) {
    return (
      <Card className="card-glass">
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-5 h-5 text-accent" />
            Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-5">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-accent/60" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Sign in to track your balance
            </p>
            <Button variant="outline" size="sm" asChild className="w-full hover-lift">
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const available = wallet?.balance ?? 0;
  const locked = wallet?.locked_balance ?? 0;
  const total = available + locked;

  return (
    <Card className="card-glass">
      <CardHeader className="py-3 px-4 border-b border-border/50">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <div className="relative">
              <Wallet className="w-5 h-5 text-accent" />
              <div className="absolute inset-0 w-5 h-5 bg-accent/20 blur-md rounded-full" />
            </div>
            Wallet
          </span>
          <Button variant="ghost" size="sm" asChild className="text-xs group">
            <Link to="/wallet" className="flex items-center gap-1">
              Manage
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {/* Available */}
          <div className={cn(
            "p-3 rounded-xl text-center transition-all",
            "bg-success/10 border border-success/20",
            "hover:border-success/40 hover:bg-success/15"
          )}>
            <CoinDisplay amount={available} size="sm" />
            <p className="text-xs text-muted-foreground mt-1.5">Available</p>
          </div>
          
          {/* Locked */}
          <div className={cn(
            "p-3 rounded-xl text-center transition-all",
            "bg-warning/10 border border-warning/20",
            locked > 0 && "animate-pulse-soft"
          )}>
            <div className="flex items-center justify-center gap-1">
              <CoinDisplay amount={locked} size="sm" />
              {locked > 0 && <Lock className="w-3 h-3 text-warning" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Locked</p>
          </div>
          
          {/* Total */}
          <div className={cn(
            "p-3 rounded-xl text-center transition-all",
            "bg-primary/10 border border-primary/20",
            "hover:border-primary/40"
          )}>
            <CoinDisplay amount={total} size="sm" />
            <p className="text-xs text-muted-foreground mt-1.5">Total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
