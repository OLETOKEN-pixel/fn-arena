import { useEffect, useMemo, useState } from 'react';
import { Trophy, X, Loader2, AlertTriangle, CheckCircle2, Clock, Users, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';

interface TeamResultDeclarationProps {
  match: Match;
  currentUserId: string;
  onResultDeclared: () => void;
}

export function TeamResultDeclaration({ match, currentUserId, onResultDeclared }: TeamResultDeclarationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showFinalizeRetry, setShowFinalizeRetry] = useState(false);

  const participant = useMemo(() => {
    return match.participants?.find((p) => p.user_id === currentUserId) ?? null;
  }, [match.participants, currentUserId]);

  const userTeamSide = participant?.team_side;
  const isTeamMatch = match.team_size > 1;
  
  // Get team statuses
  const teamAParticipants = match.participants?.filter(p => p.team_side === 'A') ?? [];
  const teamBParticipants = match.participants?.filter(p => p.team_side === 'B') ?? [];
  
  const teamAResult = teamAParticipants.find(p => p.result_choice)?.result_choice ?? null;
  const teamBResult = teamBParticipants.find(p => p.result_choice)?.result_choice ?? null;
  
  const myTeamResult = userTeamSide === 'A' ? teamAResult : teamBResult;
  const opponentTeamResult = userTeamSide === 'A' ? teamBResult : teamAResult;
  
  const hasSubmitted = myTeamResult !== null;

  const bothTeamsDeclared = useMemo(() => {
    return teamAResult !== null && teamBResult !== null;
  }, [teamAResult, teamBResult]);

  const canAttemptFinalize = match.status === 'result_pending' && bothTeamsDeclared;

  // Anti "Elaborazione..." infinite: if both teams declared but match still pending, surface a manual retry.
  useEffect(() => {
    setShowFinalizeRetry(false);

    if (!canAttemptFinalize) return;

    const t = setTimeout(() => {
      setShowFinalizeRetry(true);
    }, 8000);

    return () => clearTimeout(t);
  }, [canAttemptFinalize, match.id]);

  if (!participant || !userTeamSide) return null;

  const handleFinalize = async () => {
    if (finalizing) return;
    setFinalizing(true);

    try {
      const { data, error } = await supabase.rpc('try_finalize_match', {
        p_match_id: match.id,
      });

      if (error) throw error;

      const res = data as
        | {
            success: boolean;
            status?: string;
            winner_side?: string;
            error_code?: string;
            message?: string;
          }
        | null;

      if (!res?.success) {
        throw new Error(res?.message || 'Impossibile finalizzare il match');
      }

      if (res.status === 'completed' || res.status === 'already_finalized') {
        toast({
          title: 'Match Completato',
          description: 'Payout elaborato. Aggiorno il wallet...',
        });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
      } else if (res.status === 'disputed') {
        toast({
          title: 'Disputa Aperta',
          description: 'Errore o incoerenza in finalizzazione. Un admin esaminerà il match.',
          variant: 'destructive',
        });
      } else if (res.status === 'need_other_team') {
        toast({
          title: 'In attesa',
          description: 'Manca ancora la dichiarazione dell’altro team.',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      onResultDeclared();
    } catch (error: any) {
      console.error('Finalize match error:', error);
      toast({
        title: 'Errore Finalizzazione',
        description: error.message || 'Impossibile finalizzare il match',
        variant: 'destructive',
      });
    } finally {
      setFinalizing(false);
    }
  };

  const handleSubmitResult = async (result: 'WIN' | 'LOSS') => {
    if (submitting || hasSubmitted) return;

    setSubmitting(true);

    try {
      // Membership-based declaration + safe finalization attempt
      const { data, error } = await supabase.rpc('submit_team_declaration', {
        p_match_id: match.id,
        p_result: result,
      });

      if (error) throw error;

      const response = data as
        | {
            success: boolean;
            status?: string;
            winner_side?: string;
            error?: string;
            message?: string;
            error_code?: string;
          }
        | null;

      if (!response?.success) {
        throw new Error(response?.error || response?.message || 'Failed to submit result');
      }

      if (response.status === 'completed' || response.status === 'already_finalized') {
        const isWinner =
          (response.winner_side === 'A' && userTeamSide === 'A') ||
          (response.winner_side === 'B' && userTeamSide === 'B');
        toast({
          title: isWinner ? '🎉 Vittoria!' : 'Match Completato',
          description: isWinner
            ? 'Congratulazioni! Le vincite sono state aggiunte al tuo wallet.'
            : 'Peccato, ritenta la prossima volta!',
        });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
      } else if (response.status === 'disputed') {
        toast({
          title: 'Disputa Aperta',
          description:
            response.message ||
            'Finalizzazione non riuscita o risultati in conflitto. Un admin esaminerà il match.',
          variant: 'destructive',
        });
      } else if (response.status === 'already_submitted') {
        toast({
          title: 'Già Inviato',
          description: response.message || 'Il risultato è già stato dichiarato.',
        });
      } else {
        toast({
          title: 'Risultato Inviato',
          description: 'In attesa che l\'altro team confermi...',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      onResultDeclared();
    } catch (error: any) {
      console.error('Submit result error:', error);
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile inviare il risultato',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (match.status === 'completed' || match.status === 'admin_resolved') {
    return null;
  }

  if (match.status !== 'in_progress' && match.status !== 'result_pending') {
    return null;
  }

  return (
    <Card className="border-accent/30 bg-card overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-accent" />
          </div>
          <div>
            <span className="text-sm font-semibold">Dichiara Risultato</span>
            {isTeamMatch && (
              <p className="text-xs text-muted-foreground">Per il tuo team</p>
            )}
          </div>
        </div>

        {/* Team Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(
            'p-3 rounded-lg text-center border',
            teamAResult ? 'bg-success/10 border-success/30' : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-xs font-bold uppercase text-muted-foreground mb-1.5">
              Team A {userTeamSide === 'A' && <span className="text-accent">(Tu)</span>}
            </p>
            {teamAResult ? (
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm font-bold text-success">
                  {teamAResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <Clock className="w-5 h-5 text-muted-foreground animate-pulse mx-auto" />
            )}
          </div>

          <div className={cn(
            'p-3 rounded-lg text-center border',
            teamBResult ? 'bg-success/10 border-success/30' : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-xs font-bold uppercase text-muted-foreground mb-1.5">
              Team B {userTeamSide === 'B' && <span className="text-primary">(Tu)</span>}
            </p>
            {teamBResult ? (
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm font-bold text-success">
                  {teamBResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <Clock className="w-5 h-5 text-muted-foreground animate-pulse mx-auto" />
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!hasSubmitted ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="h-10 bg-success hover:bg-success/90 text-success-foreground font-bold text-xs"
                onClick={() => handleSubmitResult('WIN')}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    VINTO
                  </>
                )}
              </Button>

              <Button
                size="sm"
                className="h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs"
                onClick={() => handleSubmitResult('LOSS')}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <X className="w-3 h-3 mr-1" />
                    PERSO
                  </>
                )}
              </Button>
            </div>

            {/* Warning - Compact */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-200">
                Dichiarazioni false = ban e perdita coins
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-3 rounded-lg bg-primary/10">
            <Clock className="w-5 h-5 mx-auto mb-1 text-primary animate-pulse" />
            <p className="text-xs font-medium text-primary">Dichiarazione inviata (bloccata)</p>
            <p className="text-[10px] text-muted-foreground">
              {opponentTeamResult === null ? 'Attesa team avversario...' : 'Elaborazione...'}
            </p>

            {canAttemptFinalize && (
              <div className="mt-3 flex flex-col items-center gap-2">
                {showFinalizeRetry && (
                  <p className="text-[10px] text-muted-foreground">
                    Se resta in elaborazione, puoi riprovare manualmente.
                  </p>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={handleFinalize}
                  disabled={finalizing}
                >
                  {finalizing ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Riprovo...
                    </span>
                  ) : (
                    'Riprova finalizzazione'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
