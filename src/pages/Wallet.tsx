import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Lock, Coins, Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Transaction } from '@/types';
import { cn } from '@/lib/utils';

const transactionIcons: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft className="w-4 h-4 text-success" />,
  lock: <Lock className="w-4 h-4 text-warning" />,
  unlock: <Lock className="w-4 h-4 text-muted-foreground" />,
  payout: <ArrowUpRight className="w-4 h-4 text-success" />,
  refund: <ArrowDownLeft className="w-4 h-4 text-primary" />,
  fee: <Coins className="w-4 h-4 text-destructive" />,
};

export default function Wallet() {
  const navigate = useNavigate();
  const { user, wallet, loading: authLoading, refreshWallet } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchTransactions = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setTransactions(data as Transaction[]);
      }
      setLoading(false);
    };

    fetchTransactions();
    refreshWallet();
  }, [user, refreshWallet]);

  if (authLoading) return <MainLayout><Skeleton className="h-96" /></MainLayout>;

  return (
    <MainLayout showChat={false}>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="font-display text-3xl font-bold">Wallet</h1>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <WalletIcon className="w-4 h-4" />
                Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CoinDisplay amount={wallet?.balance ?? 0} size="lg" className="glow-text-gold" />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Locked (In Matches)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CoinDisplay amount={wallet?.locked_balance ?? 0} size="lg" />
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-accent/20 to-accent/5 border-accent/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-accent flex items-center gap-2">
                <Coins className="w-4 h-4" />
                Total Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CoinDisplay 
                amount={(wallet?.balance ?? 0) + (wallet?.locked_balance ?? 0)} 
                size="lg" 
                className="glow-text-gold"
              />
            </CardContent>
          </Card>
        </div>

        {/* Buy Coins CTA */}
        <Card className="bg-card border-border">
          <CardContent className="py-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Need more Coins?</h3>
              <p className="text-sm text-muted-foreground">
                Buy Coins to create and join matches
              </p>
            </div>
            <Button asChild>
              <Link to="/buy">
                <Plus className="w-4 h-4 mr-2" />
                Buy Coins
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No transactions yet
              </p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
                        {transactionIcons[tx.type]}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{tx.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.description ?? tx.type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        'font-semibold',
                        ['deposit', 'payout', 'refund', 'unlock'].includes(tx.type) 
                          ? 'text-success' 
                          : 'text-foreground'
                      )}>
                        {['deposit', 'payout', 'refund', 'unlock'].includes(tx.type) ? '+' : '-'}
                        {tx.amount.toFixed(2)} Coins
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
