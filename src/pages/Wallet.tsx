import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Wallet as WalletIcon, Lock, Coins, Plus, Banknote, Clock, CheckCircle, XCircle, CreditCard, ExternalLink, Info } from 'lucide-react';
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

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE = 0.50;

const withdrawalStatusConfig: Record<string, { icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' | 'warning' }> = {
  pending: { icon: <Clock className="w-3 h-3" />, variant: 'warning' },
  approved: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default' },
  completed: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default' },
  rejected: { icon: <XCircle className="w-3 h-3" />, variant: 'destructive' },
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
      // Remove query params
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
      // Fetch transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txData) {
        setTransactions(txData as Transaction[]);
      }

      // Fetch withdrawal requests
      const { data: wdData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (wdData) {
        setWithdrawals(wdData as WithdrawalRequest[]);
      }

      // Fetch Stripe connected account status
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

  // Connect to Stripe
  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-account');
      
      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.payouts_enabled) {
        // Already verified
        setStripeAccount(prev => prev ? { ...prev, payouts_enabled: true } : null);
        toast({
          title: 'Account già verificato',
          description: 'Puoi effettuare prelievi.',
        });
      }
    } catch (error: unknown) {
      console.error('Stripe connect error:', error);
      
      // Extract detailed error message from response
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
        
        // Log full error for debugging
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

  // Withdraw
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
        
        // Refresh withdrawals
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

  if (authLoading) return <MainLayout><Skeleton className="h-96" /></MainLayout>;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="font-display text-3xl font-bold">Wallet</h1>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <WalletIcon className="w-4 h-4" />
                Saldo Disponibile
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
                Bloccato (In Match)
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
                Saldo Totale
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

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buy Coins */}
          <Card className="bg-card border-border">
            <CardContent className="py-6 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Hai bisogno di Coins?</h3>
                <p className="text-sm text-muted-foreground">
                  Acquista Coins per creare e unirti ai match
                </p>
              </div>
              <Button asChild>
                <Link to="/buy">
                  <Plus className="w-4 h-4 mr-2" />
                  Compra Coins
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Withdraw */}
          <Card className="bg-card border-border">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Preleva</h3>
                  <p className="text-sm text-muted-foreground">
                    Min €{MIN_WITHDRAWAL} • Comm. €{WITHDRAWAL_FEE}
                  </p>
                </div>
                
                {!isStripeVerified ? (
                  <Button 
                    variant="outline" 
                    onClick={handleConnectStripe}
                    disabled={connectingStripe}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {connectingStripe ? 'Caricamento...' : 'Configura Stripe'}
                  </Button>
                ) : (
                  <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!canWithdraw}>
                        <Banknote className="w-4 h-4 mr-2" />
                        Preleva
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Richiedi Prelievo</DialogTitle>
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
                          />
                          <p className="text-xs text-muted-foreground">
                            Disponibile: €{(wallet?.balance ?? 0).toFixed(2)}
                          </p>
                        </div>

                        {withdrawAmount && parseFloat(withdrawAmount) >= MIN_WITHDRAWAL && (
                          <div className="p-3 bg-secondary rounded-lg space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Importo richiesto</span>
                              <span>€{parseFloat(withdrawAmount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Commissione</span>
                              <span>€{WITHDRAWAL_FEE.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t border-border pt-1">
                              <span>Scalato dal saldo</span>
                              <span>€{(parseFloat(withdrawAmount) + WITHDRAWAL_FEE).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
                          Annulla
                        </Button>
                        <Button 
                          onClick={handleWithdraw} 
                          disabled={submitting || parseFloat(withdrawAmount) < MIN_WITHDRAWAL}
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
                <div className="mt-3 p-3 bg-secondary/50 rounded-lg text-sm text-muted-foreground flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Completa la verifica Stripe per ricevere i pagamenti sul tuo conto bancario.
                  </span>
                </div>
              )}
              {isStripeVerified && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="w-4 h-4" />
                  <span>Account Stripe verificato</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Withdrawal Requests */}
        {withdrawals.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Richieste di Prelievo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {withdrawals.map((wd) => (
                  <div
                    key={wd.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
                        <Banknote className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">€{wd.amount.toFixed(2)} via Stripe</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(wd.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={withdrawalStatusConfig[wd.status]?.variant || 'outline'} className="flex items-center gap-1">
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

        {/* Transactions */}
        <TransactionHistory transactions={transactions} loading={loading} />
      </div>
    </MainLayout>
  );
}
