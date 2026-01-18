import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Swords, DollarSign, AlertTriangle, Banknote, CheckCircle, XCircle, TrendingUp, Wallet } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Match, Transaction, WithdrawalRequest } from '@/types';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { GlobalSearchBar } from '@/components/admin/GlobalSearchBar';
import { IssueCenter } from '@/components/admin/IssueCenter';
import { MatchesTable } from '@/components/admin/MatchesTable';
import { UsersTable } from '@/components/admin/UsersTable';
import { TransactionsTable } from '@/components/admin/TransactionsTable';

interface WithdrawalWithProfile extends WithdrawalRequest {
  profiles: Profile;
}

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Platform earnings state
  const [platformBalance, setPlatformBalance] = useState<number>(0);
  const [platformEarnings, setPlatformEarnings] = useState<{ id: string; match_id: string; amount: number; created_at: string }[]>([]);
  const [withdrawPlatformDialog, setWithdrawPlatformDialog] = useState(false);
  const [platformWithdrawAmount, setPlatformWithdrawAmount] = useState('');
  const [platformPaymentMethod, setPlatformPaymentMethod] = useState<'paypal' | 'bank'>('paypal');
  const [platformPaymentDetails, setPlatformPaymentDetails] = useState('');
  const [withdrawingPlatform, setWithdrawingPlatform] = useState(false);

  // Dialog state for processing withdrawals
  const [processDialog, setProcessDialog] = useState<{ open: boolean; withdrawal: WithdrawalWithProfile | null; action: 'approve' | 'reject' | null }>({
    open: false,
    withdrawal: null,
    action: null,
  });
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      
      const { data, error } = await supabase.rpc('is_admin');
      if (error || !data) {
        setIsAdmin(false);
        navigate('/');
      } else {
        setIsAdmin(true);
      }
    };
    
    if (!authLoading) {
      checkAdmin();
    }
  }, [user, authLoading, navigate]);

  const fetchData = async () => {
    setLoading(true);
    
    const [usersRes, matchesRes, transactionsRes, withdrawalsRes, walletRes, earningsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('matches').select(`*, creator:profiles!matches_creator_id_fkey(*), participants:match_participants(*, profile:profiles(*)), result:match_results(*)`).order('created_at', { ascending: false }).limit(200),
      supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('withdrawal_requests').select('*, profiles:user_id(*)').order('created_at', { ascending: false }),
      supabase.from('platform_wallet').select('balance').limit(1).maybeSingle(),
      supabase.from('platform_earnings').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    if (usersRes.data) setUsers(usersRes.data as Profile[]);
    if (matchesRes.data) setMatches(matchesRes.data as unknown as Match[]);
    if (transactionsRes.data) setTransactions(transactionsRes.data as Transaction[]);
    if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data as unknown as WithdrawalWithProfile[]);
    if (walletRes.data) setPlatformBalance(Number(walletRes.data.balance));
    if (earningsRes.data) setPlatformEarnings(earningsRes.data);

    setLoading(false);
  };

  useEffect(() => {
    if (!user || isAdmin !== true) return;
    fetchData();
  }, [user, isAdmin]);

  const openProcessDialog = (withdrawal: WithdrawalWithProfile, action: 'approve' | 'reject') => {
    setProcessDialog({ open: true, withdrawal, action });
    setAdminNotes('');
  };

  const handleProcessWithdrawal = async () => {
    if (!processDialog.withdrawal || !processDialog.action) return;
    setProcessing(true);

    const status = processDialog.action === 'approve' ? 'completed' : 'rejected';
    const { data, error } = await supabase.rpc('process_withdrawal', {
      p_withdrawal_id: processDialog.withdrawal.id,
      p_status: status,
      p_admin_notes: adminNotes || null,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || (result && !result.success)) {
      toast({ title: 'Errore', description: result?.error || 'Impossibile processare.', variant: 'destructive' });
    } else {
      toast({ title: processDialog.action === 'approve' ? 'Approvato' : 'Rifiutato' });
      fetchData();
    }

    setProcessing(false);
    setProcessDialog({ open: false, withdrawal: null, action: null });
  };

  const handleWithdrawPlatformEarnings = async () => {
    const amount = parseFloat(platformWithdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > platformBalance || !platformPaymentDetails.trim()) {
      toast({ title: 'Errore', description: 'Verifica i dati inseriti.', variant: 'destructive' });
      return;
    }

    setWithdrawingPlatform(true);
    const { data, error } = await supabase.rpc('withdraw_platform_earnings', {
      p_amount: amount,
      p_payment_method: platformPaymentMethod,
      p_payment_details: platformPaymentDetails,
    });

    const result = data as { success: boolean; error?: string } | null;
    if (error || (result && !result.success)) {
      toast({ title: 'Errore', description: result?.error || 'Errore.', variant: 'destructive' });
    } else {
      toast({ title: 'Richiesta inviata' });
      setPlatformBalance(platformBalance - amount);
      setWithdrawPlatformDialog(false);
    }
    setWithdrawingPlatform(false);
  };

  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
  const disputedCount = matches.filter(m => m.status === 'disputed').length;

  if (authLoading || isAdmin === null) return <MainLayout><LoadingPage /></MainLayout>;
  if (isAdmin !== true) return null;

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header with Global Search */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">Gestione completa</p>
            </div>
          </div>
          <div className="md:ml-auto">
            <GlobalSearchBar />
          </div>
        </div>

        {/* Compact Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { icon: Users, value: users.length, label: 'Utenti', color: 'text-primary' },
            { icon: Swords, value: matches.length, label: 'Match', color: 'text-accent' },
            { icon: DollarSign, value: transactions.length, label: 'TX', color: 'text-success' },
            { icon: Banknote, value: pendingWithdrawals.length, label: 'Prelievi', color: 'text-warning' },
            { icon: AlertTriangle, value: disputedCount, label: 'Dispute', color: 'text-destructive' },
            { icon: TrendingUp, value: `${platformBalance.toFixed(0)}€`, label: 'Earnings', color: 'text-accent' },
          ].map((stat, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-3 flex items-center gap-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <p className="text-lg font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="issues" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="issues" className="relative">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Issues
            </TabsTrigger>
            <TabsTrigger value="matches">Match</TabsTrigger>
            <TabsTrigger value="users">Utenti</TabsTrigger>
            <TabsTrigger value="transactions">Transazioni</TabsTrigger>
            <TabsTrigger value="withdrawals" className="relative">
              Prelievi
              {pendingWithdrawals.length > 0 && (
                <span className="ml-1 px-1.5 text-xs bg-destructive text-destructive-foreground rounded-full">{pendingWithdrawals.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
          </TabsList>

          <TabsContent value="issues">
            <IssueCenter matches={matches} onRefresh={fetchData} />
          </TabsContent>

          <TabsContent value="matches">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <MatchesTable matches={matches} loading={loading} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <UsersTable users={users} loading={loading} onUserUpdated={fetchData} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <TransactionsTable transactions={transactions} loading={loading} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawals">
            <Card className="bg-card border-border">
              <CardHeader className="py-3"><CardTitle>Richieste di Prelievo</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-48" /> : withdrawals.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nessuna richiesta</p>
                ) : (
                  <div className="space-y-2">
                    {withdrawals.map((wd) => (
                      <div key={wd.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={wd.profiles?.avatar_url ?? undefined} />
                            <AvatarFallback>{wd.profiles?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{wd.profiles?.username}</p>
                            <p className="text-xs text-muted-foreground">{wd.amount.toFixed(2)}€ via {wd.payment_method}</p>
                          </div>
                        </div>
                        {wd.status === 'pending' ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openProcessDialog(wd, 'reject')}><XCircle className="w-4 h-4" /></Button>
                            <Button size="sm" onClick={() => openProcessDialog(wd, 'approve')}><CheckCircle className="w-4 h-4" /></Button>
                          </div>
                        ) : (
                          <Badge variant={wd.status === 'completed' ? 'default' : 'destructive'}>{wd.status}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="earnings">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-gradient-to-br from-accent/10 to-transparent border-accent/20">
                <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-accent" />Platform Wallet</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-4xl font-bold text-accent">{platformBalance.toFixed(2)}€</p>
                  <Button onClick={() => setWithdrawPlatformDialog(true)} disabled={platformBalance <= 0} className="w-full">Preleva</Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle>Ultime Fee</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {platformEarnings.map((e) => (
                      <div key={e.id} className="flex justify-between p-2 rounded bg-secondary text-sm">
                        <span className="text-accent">+{e.amount.toFixed(2)}€</span>
                        <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Process Withdrawal Dialog */}
      <Dialog open={processDialog.open} onOpenChange={(open) => !open && setProcessDialog({ open: false, withdrawal: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{processDialog.action === 'approve' ? 'Approva' : 'Rifiuta'} Prelievo</DialogTitle>
            <DialogDescription>
              {processDialog.withdrawal && <><strong>{processDialog.withdrawal.amount.toFixed(2)}€</strong> per <strong>{processDialog.withdrawal.profiles?.username}</strong></>}
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Note admin..." value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessDialog({ open: false, withdrawal: null, action: null })}>Annulla</Button>
            <Button variant={processDialog.action === 'approve' ? 'default' : 'destructive'} onClick={handleProcessWithdrawal} disabled={processing}>
              {processing ? '...' : 'Conferma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform Withdraw Dialog */}
      <Dialog open={withdrawPlatformDialog} onOpenChange={setWithdrawPlatformDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Preleva Guadagni</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <input type="number" step="0.01" max={platformBalance} value={platformWithdrawAmount} onChange={(e) => setPlatformWithdrawAmount(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background" placeholder="Importo €" />
            <div className="flex gap-2">
              <Button type="button" variant={platformPaymentMethod === 'paypal' ? 'default' : 'outline'} onClick={() => setPlatformPaymentMethod('paypal')} className="flex-1">PayPal</Button>
              <Button type="button" variant={platformPaymentMethod === 'bank' ? 'default' : 'outline'} onClick={() => setPlatformPaymentMethod('bank')} className="flex-1">Bonifico</Button>
            </div>
            <input type="text" value={platformPaymentDetails} onChange={(e) => setPlatformPaymentDetails(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background" placeholder={platformPaymentMethod === 'paypal' ? 'Email PayPal' : 'IBAN'} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawPlatformDialog(false)}>Annulla</Button>
            <Button onClick={handleWithdrawPlatformEarnings} disabled={withdrawingPlatform}>{withdrawingPlatform ? '...' : 'Richiedi'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
