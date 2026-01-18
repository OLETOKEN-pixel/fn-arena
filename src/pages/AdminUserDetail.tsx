import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Wallet, Swords, DollarSign, AlertTriangle, Ban, CheckCircle, Plus, Minus, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/custom-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import type { Profile, Wallet as WalletType, Match, Transaction } from '@/types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Balance adjustment state
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [banning, setBanning] = useState(false);

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

  const fetchUserData = async () => {
    if (!id) return;
    setLoading(true);

    const [profileRes, walletRes, matchesRes, txRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('wallets').select('*').eq('user_id', id).maybeSingle(),
      supabase
        .from('match_participants')
        .select(`
          match:matches(
            *,
            creator:profiles!matches_creator_id_fkey(*),
            participants:match_participants(*, profile:profiles(*))
          )
        `)
        .eq('user_id', id)
        .order('joined_at', { ascending: false })
        .limit(20),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (profileRes.error || !profileRes.data) {
      setNotFound(true);
    } else {
      setProfile(profileRes.data as Profile);
      setNotFound(false);
    }

    if (walletRes.data) {
      setWallet(walletRes.data as WalletType);
    }

    if (matchesRes.data) {
      const uniqueMatches = matchesRes.data
        .map((mp: any) => mp.match)
        .filter((m: any, idx: number, arr: any[]) => m && arr.findIndex((x: any) => x?.id === m?.id) === idx);
      setMatches(uniqueMatches as Match[]);
    }

    if (txRes.data) {
      setTransactions(txRes.data as Transaction[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin === true && id) {
      fetchUserData();
    }
  }, [isAdmin, id]);

  const handleBanToggle = async () => {
    if (!profile) return;
    setBanning(true);

    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !profile.is_banned })
      .eq('user_id', profile.user_id);

    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare lo stato utente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: profile.is_banned ? 'Utente sbloccato' : 'Utente bannato',
        description: 'Stato utente aggiornato.',
      });
      fetchUserData();
    }

    setBanning(false);
  };

  const handleAdjustBalance = async (positive: boolean) => {
    if (!profile || !adjustAmount || !adjustReason.trim()) {
      toast({
        title: 'Dati mancanti',
        description: 'Inserisci importo e motivazione.',
        variant: 'destructive',
      });
      return;
    }

    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Importo non valido',
        description: 'Inserisci un importo positivo.',
        variant: 'destructive',
      });
      return;
    }

    setAdjusting(true);

    const finalAmount = positive ? amount : -amount;

    const { data, error } = await supabase.rpc('admin_adjust_balance', {
      p_user_id: profile.user_id,
      p_amount: finalAmount,
      p_reason: adjustReason,
    });

    const result = data as { success: boolean; error?: string } | null;

    if (error || (result && !result.success)) {
      toast({
        title: 'Errore',
        description: result?.error || 'Impossibile modificare il saldo.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Saldo aggiornato',
        description: `${positive ? '+' : '-'}${amount} coins applicati.`,
      });
      setAdjustAmount('');
      setAdjustReason('');
      fetchUserData();
    }

    setAdjusting(false);
  };

  // Separate active and completed matches
  const activeMatches = matches.filter(m => 
    ['open', 'ready_check', 'in_progress', 'result_pending', 'disputed'].includes(m.status)
  );
  const completedMatches = matches.filter(m => 
    ['finished', 'completed', 'admin_resolved', 'expired', 'canceled'].includes(m.status)
  );

  if (authLoading || isAdmin === null) return <MainLayout><LoadingPage /></MainLayout>;
  if (isAdmin !== true) return null;

  if (notFound) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="w-16 h-16 text-destructive" />
          <h1 className="text-2xl font-bold">Utente non trovato</h1>
          <p className="text-muted-foreground">L'ID specificato non corrisponde a nessun utente.</p>
          <Button onClick={() => navigate('/admin')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna all'Admin
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (loading || !profile) {
    return <MainLayout><LoadingPage /></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admin
          </Button>
          <div className="flex items-center gap-4 flex-1">
            <Avatar className="w-16 h-16">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-2xl">{profile.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-display text-2xl font-bold">{profile.username}</h1>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {profile.role === 'admin' && (
              <Badge variant="destructive">Admin</Badge>
            )}
            {profile.is_banned ? (
              <Badge variant="destructive">Banned</Badge>
            ) : (
              <Badge variant="default" className="bg-success/20 text-success">Active</Badge>
            )}
          </div>
        </div>

        {/* Profile Info */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profilo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Epic Username</p>
                <p className="font-medium">{profile.epic_username || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">{profile.preferred_region || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Platform</p>
                <p className="font-medium">{profile.preferred_platform || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registrato</p>
                <p className="font-medium">
                  {format(new Date(profile.created_at), 'dd MMM yyyy', { locale: it })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Wallet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-r from-success/10 to-transparent border-success/30">
            <CardContent className="p-6 text-center">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-success" />
              <p className="text-xs text-muted-foreground mb-1">Saldo Disponibile</p>
              <CoinDisplay amount={wallet?.balance || 0} size="lg" />
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-warning/10 to-transparent border-warning/30">
            <CardContent className="p-6 text-center">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-warning" />
              <p className="text-xs text-muted-foreground mb-1">Saldo Bloccato</p>
              <CoinDisplay amount={wallet?.locked_balance || 0} size="lg" />
            </CardContent>
          </Card>
        </div>

        {/* Admin Actions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Azioni Admin</CardTitle>
            <CardDescription>Gestisci saldo e stato utente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Balance Adjustment */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Modifica Saldo</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Importo"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-32"
                />
                <Textarea
                  placeholder="Motivazione (obbligatoria)..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="flex-1 min-h-[40px] h-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleAdjustBalance(true)}
                  disabled={adjusting}
                  className="bg-success hover:bg-success/90"
                >
                  {adjusting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Aggiungi
                </Button>
                <Button
                  onClick={() => handleAdjustBalance(false)}
                  disabled={adjusting}
                  variant="destructive"
                >
                  {adjusting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Minus className="w-4 h-4 mr-2" />}
                  Sottrai
                </Button>
              </div>
            </div>

            {/* Ban/Unban */}
            {profile.role !== 'admin' && (
              <div className="pt-4 border-t border-border">
                <Button
                  onClick={handleBanToggle}
                  disabled={banning}
                  variant={profile.is_banned ? 'default' : 'destructive'}
                >
                  {banning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : profile.is_banned ? (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  ) : (
                    <Ban className="w-4 h-4 mr-2" />
                  )}
                  {profile.is_banned ? 'Sblocca Utente' : 'Banna Utente'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for Matches and Transactions */}
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active">
              <Swords className="w-4 h-4 mr-2" />
              Match Attivi ({activeMatches.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              Storico ({completedMatches.length})
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <DollarSign className="w-4 h-4 mr-2" />
              Transazioni ({transactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                {activeMatches.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nessun match attivo</p>
                ) : (
                  <div className="space-y-2">
                    {activeMatches.map((m) => (
                      <MatchRow key={m.id} match={m} navigate={navigate} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                {completedMatches.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nessun match nello storico</p>
                ) : (
                  <div className="space-y-2">
                    {completedMatches.map((m) => (
                      <MatchRow key={m.id} match={m} navigate={navigate} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                {transactions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nessuna transazione</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={
                            tx.type === 'payout' || tx.type === 'refund' || tx.type === 'deposit' 
                              ? 'bg-success/20 text-success' 
                              : 'bg-destructive/20 text-destructive'
                          }>
                            {tx.type}
                          </Badge>
                          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {tx.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <CoinDisplay 
                            amount={tx.amount} 
                            size="sm"
                          />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(tx.created_at), 'dd MMM HH:mm', { locale: it })}
                          </span>
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
    </MainLayout>
  );
}

function MatchRow({ match, navigate }: { match: Match; navigate: (path: string) => void }) {
  const STATUS_COLORS: Record<string, string> = {
    open: 'bg-blue-500/20 text-blue-400',
    ready_check: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-orange-500/20 text-orange-400',
    finished: 'bg-green-500/20 text-green-400',
    completed: 'bg-green-500/20 text-green-400',
    expired: 'bg-gray-500/20 text-gray-400',
    disputed: 'bg-red-500/20 text-red-400',
    admin_resolved: 'bg-purple-500/20 text-purple-400',
  };

  return (
    <div 
      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer"
      onClick={() => navigate(`/admin/matches/${match.id}`)}
    >
      <div className="flex items-center gap-3">
        <Swords className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{match.mode} • {match.team_size}v{match.team_size}</p>
          <p className="text-xs text-muted-foreground">{match.region}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <CoinDisplay amount={match.entry_fee} size="sm" />
        <Badge variant="outline" className={STATUS_COLORS[match.status] || ''}>
          {match.status}
        </Badge>
      </div>
    </div>
  );
}
