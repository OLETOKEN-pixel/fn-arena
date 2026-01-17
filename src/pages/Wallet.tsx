import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Lock, Coins, Plus, Banknote, Clock, CheckCircle, XCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Transaction, WithdrawalRequest } from '@/types';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/custom-badge';

const transactionIcons: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft className="w-4 h-4 text-success" />,
  lock: <Lock className="w-4 h-4 text-warning" />,
  unlock: <Lock className="w-4 h-4 text-muted-foreground" />,
  payout: <ArrowUpRight className="w-4 h-4 text-success" />,
  refund: <ArrowDownLeft className="w-4 h-4 text-primary" />,
  fee: <Coins className="w-4 h-4 text-destructive" />,
};

const withdrawalStatusConfig: Record<string, { icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' | 'warning' }> = {
  pending: { icon: <Clock className="w-3 h-3" />, variant: 'warning' },
  approved: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default' },
  completed: { icon: <CheckCircle className="w-3 h-3" />, variant: 'default' },
  rejected: { icon: <XCircle className="w-3 h-3" />, variant: 'destructive' },
};

export default function Wallet() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, wallet, loading: authLoading, refreshWallet } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Withdrawal dialog state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'bank'>('paypal');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

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

      setLoading(false);
    };

    fetchData();
    refreshWallet();
  }, [user, refreshWallet]);

  const handleWithdraw = async () => {
    if (!user || !profile) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 5) {
      toast({
        title: 'Importo non valido',
        description: 'Il prelievo minimo è di 5€.',
        variant: 'destructive',
      });
      return;
    }

    if (amount > (wallet?.balance ?? 0)) {
      toast({
        title: 'Saldo insufficiente',
        description: 'Non hai abbastanza coins disponibili.',
        variant: 'destructive',
      });
      return;
    }

    // Check payment details
    const paymentDetails = paymentMethod === 'paypal' ? profile.paypal_email : profile.iban;
    if (!paymentDetails) {
      toast({
        title: 'Dati mancanti',
        description: `Aggiungi il tuo ${paymentMethod === 'paypal' ? 'PayPal' : 'IBAN'} nel profilo prima di prelevare.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from('withdrawal_requests')
      .insert({
        user_id: user.id,
        amount,
        payment_method: paymentMethod,
        payment_details: paymentDetails,
      });

    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile creare la richiesta di prelievo.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Richiesta inviata',
        description: 'La tua richiesta di prelievo è in attesa di approvazione.',
      });
      setWithdrawOpen(false);
      setWithdrawAmount('');
      
      // Refresh withdrawals
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setWithdrawals(data as WithdrawalRequest[]);
    }

    setSubmitting(false);
  };

  const canWithdraw = (wallet?.balance ?? 0) >= 5;
  const hasPaymentDetails = profile?.paypal_email || profile?.iban;

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
            <CardContent className="py-6 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Preleva i tuoi Coins</h3>
                <p className="text-sm text-muted-foreground">
                  Minimo 5€ • PayPal o Bonifico
                </p>
              </div>
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
                      1 Coin = 1€. Il prelievo minimo è di 5€.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {!hasPaymentDetails && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                        Devi prima aggiungere i tuoi dati di pagamento (PayPal o IBAN) nel{' '}
                        <Link to="/profile" className="underline font-medium">profilo</Link>.
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Importo (€)</Label>
                      <Input
                        type="number"
                        min={5}
                        max={wallet?.balance ?? 0}
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="5.00"
                      />
                      <p className="text-xs text-muted-foreground">
                        Disponibile: {(wallet?.balance ?? 0).toFixed(2)}€
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Metodo di pagamento</Label>
                      <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'paypal' | 'bank')}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="paypal" id="paypal" />
                          <Label htmlFor="paypal" className="font-normal">
                            PayPal {profile?.paypal_email && <span className="text-muted-foreground">({profile.paypal_email})</span>}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="bank" id="bank" />
                          <Label htmlFor="bank" className="font-normal">
                            Bonifico Bancario {profile?.iban && <span className="text-muted-foreground">({profile.iban.slice(0, 8)}...)</span>}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
                      Annulla
                    </Button>
                    <Button 
                      onClick={handleWithdraw} 
                      disabled={submitting || !hasPaymentDetails}
                    >
                      {submitting ? 'Invio...' : 'Richiedi Prelievo'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
                        <p className="font-medium">{wd.amount.toFixed(2)}€ via {wd.payment_method === 'paypal' ? 'PayPal' : 'Bonifico'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(wd.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={withdrawalStatusConfig[wd.status].variant} className="flex items-center gap-1">
                      {withdrawalStatusConfig[wd.status].icon}
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
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Storico Transazioni</CardTitle>
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
                Nessuna transazione
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
