import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, XCircle, Users, RefreshCw, ExternalLink, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/custom-badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Match } from '@/types';

interface LegacyCleanupResult {
  success: boolean;
  non_terminal_processed?: number;
  terminal_stuck_processed?: number;
  total_matches_processed?: number;
  total_refunded?: number;
  processed_match_ids?: string[];
  auto_refund_result?: { processed?: number; refunded_total?: number };
  orphan_fix_result?: { fixed_wallets?: number; fixed_total?: number };
  error?: string;
}

interface IssueStats {
  disputed: number;
  expired_with_locks: number;
  stuck_ready_check: number;
  inconsistent_results: number;
  total: number;
}

interface IssueCenterProps {
  matches: Match[];
  onRefresh: () => void;
}

export function IssueCenter({ matches, onRefresh }: IssueCenterProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<IssueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<LegacyCleanupResult | null>(null);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_issue_stats');
    if (!error && data) {
      setStats(data as unknown as IssueStats);
    }
    setLoading(false);
  };

  const handleLegacyCleanup = async () => {
    setCleaningUp(true);
    try {
      const { data, error } = await supabase.rpc('admin_cleanup_legacy_stuck_matches', {
        p_cutoff_minutes: 35
      });
      
      if (error) {
        toast({ 
          title: 'Errore', 
          description: error.message, 
          variant: 'destructive' 
        });
        return;
      }

      const result = data as unknown as LegacyCleanupResult;
      setCleanupResult(result);
      setShowCleanupDialog(true);

      if (result.success) {
        toast({ 
          title: 'Pulizia completata', 
          description: `${result.total_matches_processed || 0} match processati, ${result.total_refunded || 0} Coins rimborsati` 
        });
        // Refresh data
        fetchStats();
        onRefresh();
      }
    } catch (e) {
      toast({ 
        title: 'Errore', 
        description: 'Errore durante la pulizia', 
        variant: 'destructive' 
      });
    } finally {
      setCleaningUp(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [matches]);

  const disputedMatches = matches.filter(m => m.status === 'disputed');
  const expiredMatches = matches.filter(m => m.status === 'expired');
  const stuckReadyMatches = matches.filter(m => 
    m.status === 'ready_check' && 
    new Date(m.created_at).getTime() < Date.now() - 10 * 60 * 1000
  );

  // Find inconsistent results (both teams declared same result)
  const inconsistentMatches = matches.filter(m => {
    if (!m.participants || m.status !== 'finished') return false;
    const teamAChoice = m.participants.find(p => p.team_side === 'A')?.result_choice;
    const teamBChoice = m.participants.find(p => p.team_side === 'B')?.result_choice;
    return teamAChoice && teamBChoice && teamAChoice === teamBChoice;
  });

  const issueCategories = [
    {
      key: 'disputed',
      label: 'Dispute',
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      count: stats?.disputed ?? disputedMatches.length,
      items: disputedMatches,
    },
    {
      key: 'expired_with_locks',
      label: 'Expired con Fondi',
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
      count: stats?.expired_with_locks ?? 0,
      items: expiredMatches,
    },
    {
      key: 'stuck_ready',
      label: 'Ready Check Bloccati',
      icon: Users,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      count: stats?.stuck_ready_check ?? stuckReadyMatches.length,
      items: stuckReadyMatches,
    },
    {
      key: 'inconsistent',
      label: 'Risultati Incoerenti',
      icon: XCircle,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      count: stats?.inconsistent_results ?? inconsistentMatches.length,
      items: inconsistentMatches,
    },
  ];

  const handleRefresh = () => {
    fetchStats();
    onRefresh();
    toast({ title: 'Aggiornato', description: 'Dati issue aggiornati' });
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg">Centro Issues</h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLegacyCleanup} 
            disabled={cleaningUp}
            className="text-warning border-warning/50 hover:bg-warning/10"
          >
            <Wrench className={`w-4 h-4 mr-2 ${cleaningUp ? 'animate-spin' : ''}`} />
            {cleaningUp ? 'Pulizia...' : 'Ripara Match Legacy'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {issueCategories.map((cat) => (
          <Card 
            key={cat.key} 
            className={`${cat.bg} border-none cursor-pointer hover:opacity-80 transition-opacity`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <cat.icon className={`w-6 h-6 ${cat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{cat.count}</p>
                  <p className="text-xs text-muted-foreground">{cat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Issue Lists */}
      <div className="grid gap-4 md:grid-cols-2">
        {issueCategories.map((cat) => (
          cat.count > 0 && (
            <Card key={cat.key} className="bg-card border-border">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <cat.icon className={`w-4 h-4 ${cat.color}`} />
                  {cat.label}
                  <Badge variant="outline" className="ml-auto">{cat.count}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {cat.items.slice(0, 5).map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between p-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {match.team_size}v{match.team_size} {match.mode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {match.region} • {match.entry_fee} Coins
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/admin/matches/${match.id}`)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {cat.items.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{cat.items.length - 5} altri
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>

      {stats?.total === 0 && (
        <Card className="bg-success/10 border-success/20">
          <CardContent className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-success" />
            </div>
            <p className="font-medium text-success">Nessun problema rilevato!</p>
            <p className="text-sm text-muted-foreground">Tutti i match sono in ordine.</p>
          </CardContent>
        </Card>
      )}

      {/* Legacy Cleanup Result Dialog */}
      <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-warning" />
              Risultato Pulizia Legacy
            </DialogTitle>
            <DialogDescription>
              Riepilogo delle operazioni eseguite
            </DialogDescription>
          </DialogHeader>
          
          {cleanupResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{cleanupResult.non_terminal_processed || 0}</p>
                  <p className="text-xs text-muted-foreground">Match Non-Terminali</p>
                </div>
                <div className="bg-secondary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{cleanupResult.terminal_stuck_processed || 0}</p>
                  <p className="text-xs text-muted-foreground">Match Bloccati</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 text-center col-span-2">
                  <p className="text-2xl font-bold text-primary">
                    {(cleanupResult.total_refunded || 0).toFixed(2)} Coins
                  </p>
                  <p className="text-xs text-muted-foreground">Totale Rimborsato</p>
                </div>
              </div>

              {cleanupResult.orphan_fix_result && cleanupResult.orphan_fix_result.fixed_wallets! > 0 && (
                <div className="bg-warning/10 rounded-lg p-3">
                  <p className="text-sm font-medium text-warning">
                    Wallet riparati: {cleanupResult.orphan_fix_result.fixed_wallets}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{(cleanupResult.orphan_fix_result.fixed_total || 0).toFixed(2)} Coins sbloccati
                  </p>
                </div>
              )}

              {cleanupResult.processed_match_ids && cleanupResult.processed_match_ids.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Match processati (primi 10):</p>
                  <div className="font-mono bg-secondary rounded p-2 max-h-20 overflow-y-auto">
                    {cleanupResult.processed_match_ids.map(id => (
                      <div key={id}>{id.slice(0, 8)}...</div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={() => setShowCleanupDialog(false)}
              >
                Chiudi
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
