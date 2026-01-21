import { useState } from 'react';
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

  const participant = match.participants?.find(p => p.user_id === currentUserId);
  
  if (!participant) return null;
  
  const userTeamSide = participant.team_side;
  const isTeamMatch = match.team_size > 1;
  
  // Determine if current user is the captain using persistent columns (single source of truth)
  const isCaptain = (() => {
    if (!isTeamMatch) return true; // 1v1: everyone can declare
    // Use the persistent captain columns from the match record
    if (userTeamSide === 'A') return currentUserId === match.captain_a_user_id;
    return currentUserId === match.captain_b_user_id;
  })();
  
  // Get team statuses
  const teamAParticipants = match.participants?.filter(p => p.team_side === 'A') ?? [];
  const teamBParticipants = match.participants?.filter(p => p.team_side === 'B') ?? [];
  
  const teamAResult = teamAParticipants.find(p => p.result_choice)?.result_choice ?? null;
  const teamBResult = teamBParticipants.find(p => p.result_choice)?.result_choice ?? null;
  
  const myTeamResult = userTeamSide === 'A' ? teamAResult : teamBResult;
  const opponentTeamResult = userTeamSide === 'A' ? teamBResult : teamAResult;
  
  const hasSubmitted = myTeamResult !== null;

  const handleSubmitResult = async (result: 'WIN' | 'LOSS') => {
    if (submitting || hasSubmitted) return;

    setSubmitting(true);

    try {
      // Use unified declare_result RPC for all match types
      const { data, error } = await supabase.rpc('declare_result', {
        p_match_id: match.id,
        p_result: result,
      });

      if (error) throw error;

      const response = data as { success: boolean; error?: string; status?: string; winner_side?: string; message?: string };

      if (!response.success) {
        throw new Error(response.error || 'Failed to submit result');
      }

      if (response.status === 'completed') {
        const isWinner = (response.winner_side === 'A' && userTeamSide === 'A') || 
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
          description: 'I risultati sono in conflitto. Un admin esaminerà il match.',
          variant: 'destructive',
        });
      } else if (response.status === 'finalize_failed') {
        toast({
          title: 'Errore Finalizzazione',
          description: response.error || 'Impossibile completare il match. Contatta il supporto.',
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
          description: response.message || 'In attesa che l\'altro team confermi...',
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
              <p className="text-xs text-muted-foreground">Solo il capitano</p>
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
          isCaptain ? (
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
            <div className="text-center py-3 rounded-lg bg-secondary/30">
              <Users className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs font-medium">In attesa del capitano</p>
            </div>
          )
        ) : (
          <div className="text-center py-3 rounded-lg bg-primary/10">
            <Clock className="w-5 h-5 mx-auto mb-1 text-primary animate-pulse" />
            <p className="text-xs font-medium text-primary">Risultato Inviato</p>
            <p className="text-[10px] text-muted-foreground">
              {opponentTeamResult === null ? 'Attesa team avversario...' : 'Elaborazione...'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
