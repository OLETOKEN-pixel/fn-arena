import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Wallet as WalletIcon, Lock, Coins, Plus, Banknote, Clock, CheckCircle, XCircle, CreditCard, Info, ChevronDown, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { TransactionHistory } from '@/components/wallet/TransactionHistory';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Transaction, WithdrawalRequest } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/custom-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE = 0.50;

const withdrawalStatusConfig: Record<string, { icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' | 'warning'; color: string }> = {
  pending: { icon: <Clock className="w-3 h-3" />, variant: 'warning', color: 'text-warning' },
  approved: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default', color: 'text-success' },
  completed: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default', color: 'text-success' },
  rejected: { icon: <XCircle className="w-3 h-3" />, variant: 'destructive', color: 'text-destructive' },
};

interface StripeConnectedAccount {
  onboarding_complete: boolean;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  stripe_account_id: string;
}

export default function Wallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, wallet, loading: authLoading, refreshWallet } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  
  // Stripe Connect state
  const [stripeAccount, setStripeAccount] = useState<StripeConnectedAccount | null>(null);
  const [connectingStripe, setConnectingStripe] = useState(false);
  
  // Withdrawal dialog state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Handle Stripe onboarding return
  useEffect(() => {
    const stripeOnboarding = searchParams.get('stripe_onboarding');
    const stripeRefresh = searchParams.get('stripe_refresh');
    
    if (stripeOnboarding === 'complete') {
      toast({
        title: 'Verifica completata',
        description: 'Il tuo account Stripe è stato configurato. Puoi ora effettuare prelievi.',
      });
      navigate('/wallet', { replace: true });
    } else if (stripeRefresh === 'true') {
      toast({
        title: 'Verifica incompleta',
        description: 'Completa la verifica Stripe per abilitare i prelievi.',
        variant: 'destructive',
      });
      navigate('/wallet', { replace: true });
    }
  }, [searchParams, navigate, toast]);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate(`/auth?next=${encodeURIComponent(location.pathname)}`);
    }
  }, [user, authLoading, navigate, location.pathname]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txData) {
        setTransactions(txData as Transaction[]);
      }

      const { data: wdData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (wdData) {
        setWithdrawals(wdData as WithdrawalRequest[]);
      }

      const { data: stripeData } = await supabase
        .from('stripe_connected_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (stripeData) {
        setStripeAccount(stripeData as StripeConnectedAccount);
      }

      setLoading(false);
    };

    fetchData();
    refreshWallet();
  }, [user, refreshWallet]);

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-account');
      
      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.payouts_enabled) {
        setStripeAccount(prev => prev ? { ...prev, payouts_enabled: true } : null);
        toast({
          title: 'Account già verificato',
          description: 'Puoi effettuare prelievi.',
        });
      }
    } catch (error: unknown) {
      console.error('Stripe connect error:', error);
      
      let errorMessage = 'Impossibile avviare la verifica Stripe. Riprova.';
      let requestId: string | null = null;
      
      if (error && typeof error === 'object') {
        const errObj = error as { 
          message?: string; 
          context?: { 
            body?: { 
              error?: string; 
              details?: string; 
              stripeRequestId?: string;
              code?: string;
            } 
          } 
        };
        const body = errObj.context?.body;
        errorMessage = body?.error || body?.details || errObj.message || errorMessage;
        requestId = body?.stripeRequestId || null;
        
        console.error('Stripe error details:', JSON.stringify(body, null, 2));
      }
      
      toast({
        title: 'Errore Stripe',
        description: requestId 
          ? `${errorMessage} (ID: ${requestId})` 
          : errorMessage,
        variant: 'destructive',
      });
    } finally {
      setConnectingStripe(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const totalDeduction = amount + WITHDRAWAL_FEE;

    if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
      toast({
        title: 'Importo non valido',
        description: `Il prelievo minimo è di €${MIN_WITHDRAWAL}.`,
        variant: 'destructive',
      });
      return;
    }

    if (totalDeduction > (wallet?.balance ?? 0)) {
      toast({
        title: 'Saldo insufficiente',
        description: `Servono €${totalDeduction.toFixed(2)} (importo + commissione €${WITHDRAWAL_FEE}).`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-payout', {
        body: { amount },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Prelievo completato',
          description: `€${amount} trasferiti al tuo account Stripe.`,
        });
        setWithdrawOpen(false);
        setWithdrawAmount('');
        refreshWallet();
        
        const { data: wdData } = await supabase
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });
        if (wdData) setWithdrawals(wdData as WithdrawalRequest[]);
      } else {
        throw new Error(data?.error || 'Errore sconosciuto');
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile completare il prelievo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canWithdraw = (wallet?.balance ?? 0) >= (MIN_WITHDRAWAL + WITHDRAWAL_FEE);
  const isStripeVerified = stripeAccount?.payouts_enabled === true;

  if (authLoading) return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-page-enter">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-8 animate-page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <WalletIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Wallet</h1>
            <p className="text-muted-foreground">Gestisci il tuo saldo e le transazioni</p>
          </div>
        </div>

        {/* Balance Cards - Premium Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Available Balance */}
          <Card className="card-premium card-hover overflow-hidden animate-card-enter stagger-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <WalletIcon className="w-4 h-4 text-primary" />
                </div>
                Saldo Disponibile
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight glow-text-gold">
                  €{(wallet?.balance ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-success">
                <TrendingUp className="w-3 h-3" />
                <span>Pronto all'uso</span>
              </div>
            </CardContent>
          </Card>

          {/* Locked Balance */}
          <Card className="card-premium card-hover overflow-hidden animate-card-enter stagger-2">
            <div className="absolute inset-0 bg-gradient-to-br from-warning/5 via-transparent to-transparent" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-warning" />
                </div>
                Bloccato
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight text-warning">
                  €{(wallet?.locked_balance ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>In match attivi</span>
              </div>
            </CardContent>
          </Card>

          {/* Total Balance */}
          <Card className="relative overflow-hidden animate-card-enter stagger-3 border-0">
            <div className="absolute inset-0 gradient-gold opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-medium text-accent-foreground/80 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                  <Coins className="w-4 h-4 text-accent-foreground" />
                </div>
                Saldo Totale
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight text-accent-foreground drop-shadow-lg">
                  €{((wallet?.balance ?? 0) + (wallet?.locked_balance ?? 0)).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-accent-foreground/70">
                <Coins className="w-3 h-3" />
                <span>Patrimonio totale</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Premium */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buy Coins */}
          <Card className="card-premium card-hover animate-card-enter stagger-4 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="py-6 flex items-center justify-between relative">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <ArrowDownLeft className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg">Acquista Coins</h3>
                  <p className="text-sm text-muted-foreground">
                    Ricarica il tuo wallet
                  </p>
                </div>
              </div>
              <Button asChild variant="premium" className="glow-blue-soft">
                <Link to="/buy">
                  <Plus className="w-4 h-4 mr-2" />
                  Compra
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Withdraw */}
          <Card className="card-premium card-hover animate-card-enter stagger-5 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-success/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="py-6 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <ArrowUpRight className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Preleva</h3>
                    <p className="text-sm text-muted-foreground">
                      Min €{MIN_WITHDRAWAL} • Comm. €{WITHDRAWAL_FEE}
                    </p>
                  </div>
                </div>
                
                {!isStripeVerified ? (
                  <Button 
                    variant="outline" 
                    onClick={handleConnectStripe}
                    disabled={connectingStripe}
                    className="border-primary/30 hover:border-primary hover:bg-primary/10"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {connectingStripe ? 'Caricamento...' : 'Configura Stripe'}
                  </Button>
                ) : (
                  <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!canWithdraw} className="border-success/30 hover:border-success hover:bg-success/10">
                        <Banknote className="w-4 h-4 mr-2" />
                        Preleva
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="card-premium border-0">
                      <DialogHeader>
                        <DialogTitle className="font-display text-xl">Richiedi Prelievo</DialogTitle>
                        <DialogDescription>
                          Minimo €{MIN_WITHDRAWAL} • Commissione €{WITHDRAWAL_FEE}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Importo (€)</Label>
                          <Input
                            type="number"
                            min={MIN_WITHDRAWAL}
                            max={(wallet?.balance ?? 0) - WITHDRAWAL_FEE}
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder={`${MIN_WITHDRAWAL}.00`}
                            className="text-lg font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            Disponibile: €{(wallet?.balance ?? 0).toFixed(2)}
                          </p>
                        </div>

                        {withdrawAmount && parseFloat(withdrawAmount) >= MIN_WITHDRAWAL && (
                          <div className="p-4 bg-secondary/50 rounded-xl space-y-2 text-sm border border-border">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Importo richiesto</span>
                              <span className="font-mono font-medium">€{parseFloat(withdrawAmount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Commissione</span>
                              <span className="font-mono">-€{WITHDRAWAL_FEE.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-semibold border-t border-border pt-2">
                              <span>Scalato dal saldo</span>
                              <span className="font-mono text-primary">€{(parseFloat(withdrawAmount) + WITHDRAWAL_FEE).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>
                          Annulla
                        </Button>
                        <Button 
                          onClick={handleWithdraw} 
                          disabled={submitting || parseFloat(withdrawAmount) < MIN_WITHDRAWAL}
                          variant="premium"
                        >
                          {submitting ? 'Elaborazione...' : 'Conferma Prelievo'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              
              {/* Stripe status info */}
              {!isStripeVerified && (
                <div className="mt-4 p-3 bg-secondary/50 rounded-xl text-sm text-muted-foreground flex items-start gap-3 border border-border/50">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Info className="w-4 h-4 text-primary" />
                  </div>
                  <span>
                    Completa la verifica Stripe per ricevere i pagamenti sul tuo conto bancario.
                  </span>
                </div>
              )}
              {isStripeVerified && (
                <div className="mt-4 flex items-center gap-2 text-sm text-success">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Account Stripe verificato</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Withdrawal Requests - Premium */}
        {withdrawals.length > 0 && (
          <Card className="card-premium animate-card-enter stagger-6">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Banknote className="w-4 h-4 text-primary" />
                </div>
                Richieste di Prelievo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {withdrawals.map((wd) => (
                  <div
                    key={wd.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 hover:bg-secondary/70 transition-colors border border-border/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        wd.status === 'completed' || wd.status === 'approved' 
                          ? 'bg-success/10' 
                          : wd.status === 'pending' 
                            ? 'bg-warning/10' 
                            : 'bg-destructive/10'
                      )}>
                        <Banknote className={cn(
                          "w-5 h-5",
                          withdrawalStatusConfig[wd.status]?.color || 'text-muted-foreground'
                        )} />
                      </div>
                      <div>
                        <p className="font-display font-bold">€{wd.amount.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(wd.created_at).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={withdrawalStatusConfig[wd.status]?.variant || 'outline'} className="flex items-center gap-1.5 px-3">
                      {withdrawalStatusConfig[wd.status]?.icon}
                      {wd.status === 'pending' && 'In attesa'}
                      {wd.status === 'approved' && 'Approvato'}
                      {wd.status === 'completed' && 'Completato'}
                      {wd.status === 'rejected' && 'Rifiutato'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transaction History - Collapsible Premium */}
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card className="card-premium overflow-hidden">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    Storico Transazioni
                    <Badge variant="secondary" className="ml-2 font-mono">
                      {transactions.length}
                    </Badge>
                  </CardTitle>
                  <ChevronDown className={cn(
                    "w-5 h-5 text-muted-foreground transition-transform duration-300",
                    historyOpen && "rotate-180"
                  )} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <TransactionHistory transactions={transactions} loading={loading} />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </MainLayout>
  );
}
