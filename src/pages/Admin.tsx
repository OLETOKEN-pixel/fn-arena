import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Swords, DollarSign, AlertTriangle, Ban, CheckCircle, Banknote, XCircle, Clock } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Match, Transaction, WithdrawalRequest } from '@/types';
import { LoadingPage } from '@/components/common/LoadingSpinner';

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

  // Dialog state for processing withdrawals
  const [processDialog, setProcessDialog] = useState<{ open: boolean; withdrawal: WithdrawalWithProfile | null; action: 'approve' | 'reject' | null }>({
    open: false,
    withdrawal: null,
    action: null,
  });
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Check admin status via secure server-side function
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

  useEffect(() => {
    if (!user || isAdmin !== true) return;

    const fetchData = async () => {
      // Fetch users
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (usersData) setUsers(usersData as Profile[]);

      // Fetch matches
      const { data: matchesData } = await supabase
        .from('matches')
        .select('*, creator:profiles!matches_creator_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (matchesData) setMatches(matchesData as unknown as Match[]);

      // Fetch transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (transactionsData) setTransactions(transactionsData as Transaction[]);

      // Fetch withdrawal requests with profiles
      const { data: withdrawalsData } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(*)')
        .order('created_at', { ascending: false });

      if (withdrawalsData) setWithdrawals(withdrawalsData as unknown as WithdrawalWithProfile[]);

      setLoading(false);
    };

    fetchData();
  }, [user, isAdmin]);

  const handleBanUser = async (userId: string, isBanned: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !isBanned })
      .eq('user_id', userId);

    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare lo stato utente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: isBanned ? 'Utente sbloccato' : 'Utente bannato',
        description: 'Stato utente aggiornato.',
      });
      setUsers(users.map(u => 
        u.user_id === userId ? { ...u, is_banned: !isBanned } : u
      ));
    }
  };

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
      toast({
        title: 'Errore',
        description: result?.error || 'Impossibile processare il prelievo.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: processDialog.action === 'approve' ? 'Prelievo approvato' : 'Prelievo rifiutato',
        description: processDialog.action === 'approve' 
          ? 'I coins sono stati scalati dal wallet.' 
          : 'La richiesta è stata rifiutata.',
      });

      // Refresh withdrawals
      const { data: newData } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(*)')
        .order('created_at', { ascending: false });

      if (newData) setWithdrawals(newData as unknown as WithdrawalWithProfile[]);
    }

    setProcessing(false);
    setProcessDialog({ open: false, withdrawal: null, action: null });
  };

  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');

  if (authLoading || isAdmin === null) return <MainLayout><LoadingPage /></MainLayout>;
  if (isAdmin !== true) return null;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-destructive/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Gestisci utenti, match e transazioni</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{users.length}</p>
                  <p className="text-sm text-muted-foreground">Utenti</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Swords className="w-8 h-8 text-accent" />
                <div>
                  <p className="text-2xl font-bold">{matches.length}</p>
                  <p className="text-sm text-muted-foreground">Match</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <DollarSign className="w-8 h-8 text-success" />
                <div>
                  <p className="text-2xl font-bold">{transactions.length}</p>
                  <p className="text-sm text-muted-foreground">Transazioni</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Banknote className="w-8 h-8 text-warning" />
                <div>
                  <p className="text-2xl font-bold">{pendingWithdrawals.length}</p>
                  <p className="text-sm text-muted-foreground">Prelievi Pendenti</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">
                    {matches.filter(m => m.status === 'disputed').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Dispute</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="withdrawals">
          <TabsList>
            <TabsTrigger value="withdrawals" className="relative">
              Prelievi
              {pendingWithdrawals.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                  {pendingWithdrawals.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">Utenti</TabsTrigger>
            <TabsTrigger value="matches">Match</TabsTrigger>
            <TabsTrigger value="transactions">Transazioni</TabsTrigger>
          </TabsList>

          <TabsContent value="withdrawals" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Richieste di Prelievo</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-48" />
                ) : withdrawals.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nessuna richiesta di prelievo</p>
                ) : (
                  <div className="space-y-3">
                    {withdrawals.map((wd) => (
                      <div
                        key={wd.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={wd.profiles?.avatar_url ?? undefined} />
                            <AvatarFallback>{wd.profiles?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{wd.profiles?.username}</p>
                            <p className="text-sm text-muted-foreground">
                              {wd.amount.toFixed(2)}€ via {wd.payment_method === 'paypal' ? 'PayPal' : 'Bonifico'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {wd.payment_details}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {wd.status === 'pending' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openProcessDialog(wd, 'reject')}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Rifiuta
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openProcessDialog(wd, 'approve')}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approva
                              </Button>
                            </>
                          ) : (
                            <Badge variant={wd.status === 'completed' || wd.status === 'approved' ? 'default' : 'destructive'}>
                              {wd.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {wd.status === 'approved' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {wd.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                              {wd.status === 'completed' && 'Completato'}
                              {wd.status === 'approved' && 'Approvato'}
                              {wd.status === 'rejected' && 'Rifiutato'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={u.avatar_url ?? undefined} />
                            <AvatarFallback>{u.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{u.username}</p>
                              {u.role === 'admin' && (
                                <Badge variant="destructive">Admin</Badge>
                              )}
                              {u.is_banned && (
                                <Badge variant="destructive">Bannato</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        {u.role !== 'admin' && (
                          <Button
                            variant={u.is_banned ? 'outline' : 'destructive'}
                            size="sm"
                            onClick={() => handleBanUser(u.user_id, u.is_banned)}
                          >
                            {u.is_banned ? (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Sblocca
                              </>
                            ) : (
                              <>
                                <Ban className="w-4 h-4 mr-1" />
                                Banna
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-3">
                    {matches.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.mode} - {m.region}</p>
                            <Badge variant={m.status === 'disputed' ? 'destructive' : 'default'}>
                              {m.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Creato da {m.creator?.username} • {m.entry_fee} Coins
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                {loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-2">
                    {transactions.slice(0, 20).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                      >
                        <div>
                          <p className="font-medium capitalize">{tx.type}</p>
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{tx.amount.toFixed(2)} Coins</p>
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Process Withdrawal Dialog */}
      <Dialog open={processDialog.open} onOpenChange={(open) => !open && setProcessDialog({ open: false, withdrawal: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {processDialog.action === 'approve' ? 'Approva Prelievo' : 'Rifiuta Prelievo'}
            </DialogTitle>
            <DialogDescription>
              {processDialog.withdrawal && (
                <>
                  <strong>{processDialog.withdrawal.amount.toFixed(2)}€</strong> per{' '}
                  <strong>{processDialog.withdrawal.profiles?.username}</strong> via{' '}
                  {processDialog.withdrawal.payment_method === 'paypal' ? 'PayPal' : 'Bonifico'}
                  <br />
                  <span className="text-xs">{processDialog.withdrawal.payment_details}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {processDialog.action === 'approve' && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
                ⚠️ Assicurati di aver inviato il pagamento prima di approvare. I coins verranno scalati automaticamente.
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Note Admin (opzionale)</label>
              <Textarea
                placeholder="Aggiungi note..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessDialog({ open: false, withdrawal: null, action: null })}>
              Annulla
            </Button>
            <Button
              variant={processDialog.action === 'approve' ? 'default' : 'destructive'}
              onClick={handleProcessWithdrawal}
              disabled={processing}
            >
              {processing ? 'Elaborazione...' : processDialog.action === 'approve' ? 'Conferma Approvazione' : 'Conferma Rifiuto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
