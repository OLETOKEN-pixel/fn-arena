import { useState } from 'react';
import { Trophy, X, Loader2, AlertTriangle, CheckCircle2, Clock, Users, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';

interface TeamResultDeclarationProps {
  match: Match;
  currentUserId: string;
  onResultDeclared: () => void;
}

export function TeamResultDeclaration({ match, currentUserId, onResultDeclared }: TeamResultDeclarationProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const participant = match.participants?.find(p => p.user_id === currentUserId);
  
  if (!participant) return null;
  
  const userTeamSide = participant.team_side;
  const isTeamMatch = match.team_size > 1;
  
  // Determine if current user is the captain
  const isCaptain = (() => {
    if (!isTeamMatch) return true;
    if (userTeamSide === 'A') return currentUserId === match.creator_id;
    const teamBParticipants = match.participants?.filter(p => p.team_side === 'B') ?? [];
    const sortedByJoin = [...teamBParticipants].sort((a, b) => 
      new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );
    return sortedByJoin[0]?.user_id === currentUserId;
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
      const rpcName = isTeamMatch ? 'submit_team_result' : 'submit_match_result';
      
      const { data, error } = await supabase.rpc(rpcName, {
        p_match_id: match.id,
        p_result: result,
      });

      if (error) throw error;

      const response = data as { success: boolean; error?: string; status?: string; winner?: string; message?: string };

      if (!response.success) {
        throw new Error(response.error || 'Failed to submit result');
      }

      if (response.status === 'completed') {
        toast({
          title: result === 'WIN' ? '🎉 Vittoria!' : 'Match Completato',
          description: result === 'WIN' 
            ? 'Congratulazioni! Le vincite sono state aggiunte al tuo wallet.'
            : 'Peccato, ritenta la prossima volta!',
        });
      } else if (response.status === 'disputed') {
        toast({
          title: 'Disputa Aperta',
          description: 'I risultati sono in conflitto. Un admin esaminerà il match.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Risultato Inviato',
          description: response.message || 'In attesa che l\'altro team confermi...',
        });
      }

      onResultDeclared();
    } catch (error: any) {
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
      <CardContent className="p-3 space-y-3">
        {/* Header - Compact */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <span className="text-sm font-semibold">Dichiara Risultato</span>
            {isTeamMatch && (
              <p className="text-[10px] text-muted-foreground">Solo il capitano</p>
            )}
          </div>
        </div>

        {/* Team Status - Compact */}
        <div className="grid grid-cols-2 gap-2">
          <div className={cn(
            'p-2 rounded-lg text-center border',
            teamAResult ? 'bg-success/10 border-success/30' : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Team A {userTeamSide === 'A' && <span className="text-accent">(Tu)</span>}
            </p>
            {teamAResult ? (
              <div className="flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span className="text-xs font-bold text-success">
                  {teamAResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground animate-pulse mx-auto" />
            )}
          </div>

          <div className={cn(
            'p-2 rounded-lg text-center border',
            teamBResult ? 'bg-success/10 border-success/30' : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Team B {userTeamSide === 'B' && <span className="text-primary">(Tu)</span>}
            </p>
            {teamBResult ? (
              <div className="flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span className="text-xs font-bold text-success">
                  {teamBResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground animate-pulse mx-auto" />
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
