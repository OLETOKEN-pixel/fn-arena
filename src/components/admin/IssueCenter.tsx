import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, XCircle, Users, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/custom-badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Match } from '@/types';

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

  const fetchStats = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_issue_stats');
    if (!error && data) {
      setStats(data as unknown as IssueStats);
    }
    setLoading(false);
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
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Centro Issues</h3>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
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
    </div>
  );
}
