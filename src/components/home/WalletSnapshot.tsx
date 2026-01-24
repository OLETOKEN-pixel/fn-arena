import { Link } from 'react-router-dom';
import { Wallet, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';

export function WalletSnapshot() {
  const { user, wallet } = useAuth();

  if (!user) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-5 h-5 text-accent" />
            Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm text-muted-foreground mb-3">
            Sign in to track your balance
          </p>
          <Button variant="outline" size="sm" asChild className="w-full">
            <Link to="/auth">Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const available = wallet?.balance ?? 0;
  const locked = wallet?.locked_balance ?? 0;
  const total = available + locked;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-accent" />
            Wallet
          </span>
          <Button variant="ghost" size="sm" asChild className="text-xs">
            <Link to="/wallet" className="flex items-center gap-1">
              Manage
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-lg bg-success/10 border border-success/20">
            <CoinDisplay amount={available} size="sm" />
            <p className="text-xs text-muted-foreground mt-1">Available</p>
          </div>
          <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
            <CoinDisplay amount={locked} size="sm" />
            <p className="text-xs text-muted-foreground mt-1">Locked</p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <CoinDisplay amount={total} size="sm" />
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
