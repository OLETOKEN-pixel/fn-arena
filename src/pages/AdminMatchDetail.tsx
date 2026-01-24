import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Monitor, Swords, Users, DollarSign, AlertTriangle, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/custom-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MatchChat } from '@/components/matches/MatchChat';
import { ProofSection } from '@/components/matches/ProofSection';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import type { Match, Transaction } from '@/types';
import { PLATFORM_FEE } from '@/types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400',
  ready_check: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-orange-500/20 text-orange-400',
  finished: 'bg-green-500/20 text-green-400',
  completed: 'bg-green-500/20 text-green-400',
  expired: 'bg-gray-500/20 text-gray-400',
  disputed: 'bg-red-500/20 text-red-400',
  admin_resolved: 'bg-purple-500/20 text-purple-400',
  canceled: 'bg-gray-500/20 text-gray-400',
};

export default function AdminMatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [match, setMatch] = useState<Match | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [resolving, setResolving] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [notFound, setNotFound] = useState(false);

  const [forceExpireOpen, setForceExpireOpen] = useState(false);
  const [forceExpireReason, setForceExpireReason] = useState('');
  const [forceExpiring, setForceExpiring] = useState(false);

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

  const fetchMatch = async () => {
    if (!id) return;
    setLoading(true);

    const [matchRes, txRes] = await Promise.all([
      supabase
        .from('matches')
        .select(`
          *,
          creator:profiles!matches_creator_id_fkey(*),
          participants:match_participants(*, profile:profiles(*)),
          result:match_results(*),
          team_a:teams!matches_team_a_id_fkey(*),
          team_b:teams!matches_team_b_id_fkey(*)
        `)
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('transactions')
        .select('*')
        .eq('match_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (matchRes.error || !matchRes.data) {
      setNotFound(true);
    } else {
      setMatch(matchRes.data as unknown as Match);
      setNotFound(false);
    }

    if (txRes.data) {
      setTransactions(txRes.data as Transaction[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin === true && id) {
      fetchMatch();
    }
  }, [isAdmin, id]);

  const handleResolve = async (action: 'team_a_wins' | 'team_b_wins' | 'refund') => {
    if (!match) return;
    
    // Require notes for non-refund actions
    if (action !== 'refund' && !adminNotes.trim()) {
      toast({
        title: 'Note richieste',
        description: 'Inserisci una motivazione per la risoluzione.',
        variant: 'destructive',
      });
      return;
    }

    setResolving(true);

    const { data, error } = await supabase.rpc('admin_resolve_match_v3', {
      p_match_id: match.id,
      p_action: action,
      p_notes: adminNotes || null,
    });

    const result = data as { success: boolean; error?: string; message?: string } | null;

    if (error || (result && !result.success)) {
      toast({
        title: 'Errore',
        description: result?.error || 'Impossibile risolvere il match.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Match risolto',
        description: result?.message || 'Il match è stato risolto con successo.',
      });
      fetchMatch();
      setAdminNotes('');
    }

    setResolving(false);
  };

  const handleForceExpire = async () => {
    if (!match) return;
    setForceExpiring(true);
    try {
      const { data, error } = await supabase.rpc('admin_force_expire_match', {
        p_match_id: match.id,
        p_reason: forceExpireReason.trim() || null,
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string; refund_count?: number; refunded_total?: number } | null;
      if (!result?.success) {
        const msg = result?.error === 'already_settled'
          ? 'Match già settled (payout eseguito).'
          : result?.error === 'in_progress_blocked'
            ? 'Force Expire bloccato su match in_progress.'
            : result?.error || 'Impossibile forzare expire.';
        toast({ title: 'Errore', description: msg, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Force Expire OK',
        description: `Refunds: ${result.refund_count ?? 0} • Totale: ${(result.refunded_total ?? 0).toFixed?.(2) ?? result.refunded_total ?? 0}`,
      });
      setForceExpireOpen(false);
      setForceExpireReason('');
      fetchMatch();
    } catch (e: any) {
      toast({ title: 'Errore', description: e?.message || 'Impossibile forzare expire.', variant: 'destructive' });
    } finally {
      setForceExpiring(false);
    }
  };

  // Calculate prize/fee
  const prizePool = match ? match.entry_fee * 2 * (1 - PLATFORM_FEE) : 0;
  const platformFee = match ? match.entry_fee * 2 * PLATFORM_FEE : 0;

  // Get participants by side
  const teamAParticipants = match?.participants?.filter(p => p.team_side === 'A') || [];
  const teamBParticipants = match?.participants?.filter(p => p.team_side === 'B') || [];

  if (authLoading || isAdmin === null) return <MainLayout><LoadingPage /></MainLayout>;
  if (isAdmin !== true) return null;

  if (notFound) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="w-16 h-16 text-destructive" />
          <h1 className="text-2xl font-bold">Match non trovato</h1>
          <p className="text-muted-foreground">L'ID specificato non corrisponde a nessun match.</p>
          <Button onClick={() => navigate('/admin')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna all'Admin
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (loading || !match) {
    return <MainLayout><LoadingPage /></MainLayout>;
  }

  const canForceExpire =
    !['expired', 'completed', 'admin_resolved', 'finished', 'canceled'].includes(match.status) &&
    match.status !== 'in_progress';

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admin
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Match Detail</h1>
            <p className="text-sm text-muted-foreground font-mono">{match.id}</p>
          </div>
          <Badge variant="outline" className={`text-sm px-3 py-1 ${STATUS_COLORS[match.status] || ''}`}>
            {match.status.toUpperCase()}
          </Badge>
        </div>

        {/* Match Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <Swords className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="font-medium">{match.mode}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">{match.region}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Platform</p>
                <p className="font-medium">{match.platform}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p className="font-medium">{match.team_size}v{match.team_size}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Entry Fee</p>
                <CoinDisplay amount={match.entry_fee} size="sm" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Prize Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-gradient-to-r from-success/10 to-transparent border-success/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Prize Pool</p>
              <CoinDisplay amount={prizePool} size="lg" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Entry</p>
              <CoinDisplay amount={match.entry_fee * 2} size="lg" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Platform Fee (5%)</p>
              <CoinDisplay amount={platformFee} size="lg" />
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <TimelineItem
                label="Creato"
                date={match.created_at}
                active
              />
              {teamAParticipants.length > 0 && (
                <TimelineItem
                  label={`Team A (${teamAParticipants.map(p => p.profile?.username).join(', ')})`}
                  date={teamAParticipants[0]?.joined_at}
                  active
                />
              )}
              {teamBParticipants.length > 0 && (
                <TimelineItem
                  label={`Team B (${teamBParticipants.map(p => p.profile?.username).join(', ')})`}
                  date={teamBParticipants[0]?.joined_at}
                  active
                />
              )}
              {match.started_at && (
                <TimelineItem
                  label="Partita iniziata"
                  date={match.started_at}
                  active
                />
              )}
              {match.finished_at && (
                <TimelineItem
                  label="Match concluso"
                  date={match.finished_at}
                  active
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Participants / Teams */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Team A */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-blue-400">Team A (Host)</CardTitle>
              {match.team_a && <CardDescription>{match.team_a.name}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-3">
              {teamAParticipants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                    <AvatarFallback>{p.profile?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{p.profile?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      Ready: {p.ready ? '✓' : '✗'} • Result: {p.result_choice || '-'}
                    </p>
                  </div>
                  {p.result_choice && (
                    <Badge variant="outline" className={p.result_choice === 'WIN' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                      {p.result_choice}
                    </Badge>
                  )}
                </div>
              ))}
              {teamAParticipants.length === 0 && (
                <p className="text-muted-foreground text-sm">Nessun partecipante</p>
              )}
            </CardContent>
          </Card>

          {/* Team B */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-orange-400">Team B (Joiner)</CardTitle>
              {match.team_b && <CardDescription>{match.team_b.name}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-3">
              {teamBParticipants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                    <AvatarFallback>{p.profile?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{p.profile?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      Ready: {p.ready ? '✓' : '✗'} • Result: {p.result_choice || '-'}
                    </p>
                  </div>
                  {p.result_choice && (
                    <Badge variant="outline" className={p.result_choice === 'WIN' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                      {p.result_choice}
                    </Badge>
                  )}
                </div>
              ))}
              {teamBParticipants.length === 0 && (
                <p className="text-muted-foreground text-sm">Nessun partecipante</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dispute Info */}
        {match.result?.dispute_reason && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Disputa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{match.result.dispute_reason}</p>
            </CardContent>
          </Card>
        )}

        {/* Proof Screenshots (Admin spectator: view + delete, no upload) */}
        {user && (
          <ProofSection
            matchId={match.id}
            currentUserId={user.id}
            isAdmin={true}
            isParticipant={false}
          />
        )}

        {/* Admin Resolution Panel */}
        {(match.status === 'disputed' || match.status === 'in_progress' || match.status === 'result_pending') && (
          <Card className="bg-gradient-to-r from-primary/10 to-transparent border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="w-5 h-5" />
                Risolvi Match
              </CardTitle>
              <CardDescription>
                Scegli il vincitore o rimborsa entrambi i giocatori
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Note admin (obbligatorie per assegnare vittoria)..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleResolve('team_a_wins')}
                  disabled={resolving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Team A Vince
                </Button>
                <Button
                  onClick={() => handleResolve('team_b_wins')}
                  disabled={resolving}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Team B Vince
                </Button>
                <Button
                  onClick={() => handleResolve('refund')}
                  disabled={resolving}
                  variant="outline"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Rimborsa Entrambi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Force Expire */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Force Expire
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={!canForceExpire}
                onClick={() => setForceExpireOpen(true)}
              >
                Force Expire
              </Button>
            </CardTitle>
            <CardDescription>
              Chiude il match come <span className="font-mono">expired</span> e rimborsa in modo idempotente (no payout). Bloccato su <span className="font-mono">in_progress</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canForceExpire && (
              <p className="text-sm text-muted-foreground">
                Non disponibile per lo stato attuale.
              </p>
            )}
          </CardContent>
        </Card>

        <Dialog open={forceExpireOpen} onOpenChange={setForceExpireOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confermi Force Expire?</DialogTitle>
              <DialogDescription>
                Questa azione è idempotente (cliccabile 2 volte senza doppi rimborsi). Se il match è già settled, verrà rifiutata.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Textarea
                placeholder="Motivo (opzionale)"
                value={forceExpireReason}
                onChange={(e) => setForceExpireReason(e.target.value)}
                className="min-h-[90px]"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForceExpireOpen(false)} disabled={forceExpiring}>
                Annulla
              </Button>
              <Button variant="destructive" onClick={handleForceExpire} disabled={forceExpiring}>
                {forceExpiring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Force Expire
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Chat */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle>Chat (Admin)</CardTitle>
            <CardDescription>Messaggi mostrati con mittente “ADMIN” quando scrive un admin.</CardDescription>
          </CardHeader>
          <CardContent>
            {user && (
              <div className="h-[420px]">
                <MatchChat
                  matchId={match.id}
                  matchStatus={match.status}
                  currentUserId={user.id}
                  isAdmin={true}
                  isParticipant={false}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin Notes (if already resolved) */}
        {match.result?.admin_notes && match.status === 'admin_resolved' && (
          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-purple-400">Note Risoluzione</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{match.result.admin_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Transactions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Transazioni Match
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nessuna transazione registrata</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={tx.type === 'payout' || tx.type === 'refund' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
                        {tx.type}
                      </Badge>
                      <span className="text-muted-foreground">{tx.description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CoinDisplay amount={tx.amount} size="sm" />
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
      </div>
    </MainLayout>
  );
}

function TimelineItem({ label, date, active }: { label: string; date?: string | null; active?: boolean }) {
  if (!date) return null;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${active ? 'bg-primary' : 'bg-muted'}`} />
      <span className="font-medium">{label}</span>
      <span className="text-sm text-muted-foreground ml-auto">
        {format(new Date(date), 'dd MMM HH:mm', { locale: it })}
      </span>
    </div>
  );
}
