import { useState } from 'react';
import { AlertTriangle, Trophy, RotateCcw, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { ModeBadge, RegionBadge } from '@/components/ui/custom-badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';
import { format } from 'date-fns';

interface MatchIssueCardProps {
  match: Match;
  onResolved: () => void;
}

export function MatchIssueCard({ match, onResolved }: MatchIssueCardProps) {
  const { toast } = useToast();
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState(false);

  const teamA = match.participants?.find(p => p.team_side === 'A');
  const teamB = match.participants?.find(p => p.team_side === 'B');
  
  const prizePool = match.entry_fee * (match.team_size * 2) * 0.95;
  const platformFee = match.entry_fee * (match.team_size * 2) * 0.05;

  const handleResolve = async (action: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'REFUND_BOTH') => {
    if (!notes.trim() && action !== 'REFUND_BOTH') {
      toast({
        title: 'Notes Required',
        description: 'Please add admin notes explaining your decision.',
        variant: 'destructive',
      });
      return;
    }

    setResolving(true);

    try {
      const { data, error } = await supabase.rpc('admin_resolve_match_v2', {
        p_match_id: match.id,
        p_action: action,
        p_notes: notes || 'Resolved by admin',
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to resolve');
      }

      toast({
        title: 'Match Resolved',
        description: action === 'REFUND_BOTH' 
          ? 'Both players have been refunded.'
          : `Winner assigned: ${action === 'TEAM_A_WIN' ? teamA?.profile?.username : teamB?.profile?.username}`,
      });

      onResolved();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resolve match',
        variant: 'destructive',
      });
    } finally {
      setResolving(false);
    }
  };

  return (
    <Card className={cn(
      'bg-card border-border',
      match.status === 'disputed' && 'border-destructive/50'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Match #{match.id.slice(0, 8)}
          </CardTitle>
          <Badge variant={match.status === 'disputed' ? 'destructive' : 'secondary'}>
            {match.status === 'disputed' ? 'DISPUTED' : 'RESOLVED'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Match Info */}
        <div className="flex flex-wrap gap-2">
          <ModeBadge mode={match.mode} />
          <RegionBadge region={match.region} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">Entry</p>
            <CoinDisplay amount={match.entry_fee} size="sm" />
          </div>
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">Prize</p>
            <CoinDisplay amount={prizePool} size="sm" />
          </div>
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">Fee</p>
            <CoinDisplay amount={platformFee} size="sm" />
          </div>
        </div>

        {/* Participants */}
        <div className="space-y-2">
          {/* Team A */}
          <div className={cn(
            'flex items-center gap-3 p-3 rounded-lg',
            teamA?.result_choice === 'WIN' ? 'bg-success/10' : 'bg-secondary'
          )}>
            <Avatar className="w-10 h-10">
              <AvatarImage src={teamA?.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {teamA?.profile?.username?.charAt(0).toUpperCase() ?? 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium text-sm">{teamA?.profile?.username ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Team A (Host)</p>
            </div>
            <div className="text-right">
              <Badge variant={teamA?.result_choice === 'WIN' ? 'default' : 'destructive'}>
                {teamA?.result_choice ?? 'No Choice'}
              </Badge>
              {teamA?.result_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(teamA.result_at), 'HH:mm')}
                </p>
              )}
            </div>
          </div>

          {/* Team B */}
          <div className={cn(
            'flex items-center gap-3 p-3 rounded-lg',
            teamB?.result_choice === 'WIN' ? 'bg-success/10' : 'bg-secondary'
          )}>
            <Avatar className="w-10 h-10">
              <AvatarImage src={teamB?.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-accent/20 text-accent text-sm">
                {teamB?.profile?.username?.charAt(0).toUpperCase() ?? 'B'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium text-sm">{teamB?.profile?.username ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Team B</p>
            </div>
            <div className="text-right">
              <Badge variant={teamB?.result_choice === 'WIN' ? 'default' : 'destructive'}>
                {teamB?.result_choice ?? 'No Choice'}
              </Badge>
              {teamB?.result_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(teamB.result_at), 'HH:mm')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dispute Reason */}
        {match.result?.dispute_reason && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <p className="font-medium">Dispute Reason:</p>
            <p>{match.result.dispute_reason}</p>
          </div>
        )}

        {/* Admin Actions (only for disputed matches) */}
        {match.status === 'disputed' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide Actions' : 'Resolve Dispute'}
            </Button>

            {expanded && (
              <div className="space-y-3 pt-2 border-t border-border">
                <Textarea
                  placeholder="Admin notes (required for winner assignment)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90"
                    onClick={() => handleResolve('TEAM_A_WIN')}
                    disabled={resolving}
                  >
                    {resolving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trophy className="w-4 h-4 mr-1" />
                        {teamA?.profile?.username ?? 'Team A'} Wins
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90"
                    onClick={() => handleResolve('TEAM_B_WIN')}
                    disabled={resolving}
                  >
                    {resolving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trophy className="w-4 h-4 mr-1" />
                        {teamB?.profile?.username ?? 'Team B'} Wins
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleResolve('REFUND_BOTH')}
                  disabled={resolving}
                >
                  {resolving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Refund Both Players
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Resolved info */}
        {match.status === 'admin_resolved' && match.result?.admin_notes && (
          <div className="p-3 rounded-lg bg-secondary text-sm">
            <p className="font-medium text-muted-foreground">Admin Notes:</p>
            <p>{match.result.admin_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
