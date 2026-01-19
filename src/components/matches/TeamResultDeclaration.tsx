import { useState } from 'react';
import { Trophy, X, Loader2, AlertTriangle, CheckCircle2, Clock, Users, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="border-accent/30 bg-gradient-to-br from-card via-card to-accent/5 overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/30">
        <CardTitle className="flex items-center gap-3 text-lg">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center border border-accent/30">
            <Trophy className="w-5 h-5 text-accent" />
          </div>
          <div>
            <span>Dichiara Risultato</span>
            {isTeamMatch && (
              <p className="text-xs font-normal text-muted-foreground mt-0.5">
                Solo il capitano può dichiarare
              </p>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {/* Team Status Cards - Premium Style */}
        <div className="grid grid-cols-2 gap-4">
          {/* Team A Status */}
          <div className={cn(
            'p-4 rounded-xl text-center border transition-all',
            teamAResult 
              ? 'bg-success/10 border-success/30' 
              : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">
              Team A {userTeamSide === 'A' && <span className="text-accent">(Tu)</span>}
            </p>
            {teamAResult ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="font-bold text-success">
                  {teamAResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-warning animate-pulse" />
                <span className="font-medium text-warning">In attesa...</span>
              </div>
            )}
          </div>

          {/* Team B Status */}
          <div className={cn(
            'p-4 rounded-xl text-center border transition-all',
            teamBResult 
              ? 'bg-success/10 border-success/30' 
              : 'bg-secondary/50 border-border/50'
          )}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">
              Team B {userTeamSide === 'B' && <span className="text-primary">(Tu)</span>}
            </p>
            {teamBResult ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="font-bold text-success">
                  {teamBResult === 'WIN' ? 'Vittoria' : 'Sconfitta'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground animate-pulse" />
                <span className="font-medium text-muted-foreground">In attesa...</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons or Status */}
        {!hasSubmitted ? (
          isCaptain ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  size="lg"
                  className="h-16 bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground font-bold text-base shadow-lg shadow-success/20 transition-all hover:shadow-xl hover:shadow-success/30 hover:scale-[1.02]"
                  onClick={() => handleSubmitResult('WIN')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      ABBIAMO VINTO
                    </>
                  )}
                </Button>

                <Button
                  size="lg"
                  className="h-16 bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70 text-destructive-foreground font-bold text-base shadow-lg shadow-destructive/20 transition-all hover:shadow-xl hover:shadow-destructive/30 hover:scale-[1.02]"
                  onClick={() => handleSubmitResult('LOSS')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <X className="w-5 h-5 mr-2" />
                      ABBIAMO PERSO
                    </>
                  )}
                </Button>
              </div>

              {/* Warning - Softer Style */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-300">Attenzione</p>
                  <p className="text-amber-200/80 mt-0.5">
                    Dichiarazioni false possono comportare ban e perdita di coins.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-6 rounded-xl bg-secondary/30 border border-border/30">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-semibold text-lg">In attesa del capitano</p>
              <p className="text-sm text-muted-foreground mt-1">
                Solo il capitano del team può dichiarare il risultato.
              </p>
            </div>
          )
        ) : (
          <div className="text-center py-6 rounded-xl bg-primary/10 border border-primary/20">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <p className="font-semibold text-lg text-primary">Risultato Inviato</p>
            <p className="text-sm text-muted-foreground mt-1">
              {opponentTeamResult === null 
                ? 'In attesa che il team avversario dichiari il risultato...'
                : 'Elaborazione risultati in corso...'
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
