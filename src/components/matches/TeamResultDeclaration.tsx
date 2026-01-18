import { useState } from 'react';
import { Trophy, X, Loader2, AlertTriangle, CheckCircle2, Clock, Crown, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  // Team A captain = match creator
  // Team B captain = first joiner (team owner)
  const isCaptain = (() => {
    if (!isTeamMatch) return true; // 1v1: everyone is their own captain
    if (userTeamSide === 'A') return currentUserId === match.creator_id;
    // For Team B, check if user is team owner (first in participant list for side B)
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
      // Use submit_team_result for team matches, submit_match_result for 1v1
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

  // Don't show for completed/resolved matches
  if (match.status === 'completed' || match.status === 'admin_resolved') {
    return null;
  }

  // Only show for in_progress or result_pending
  if (match.status !== 'in_progress' && match.status !== 'result_pending') {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-warning" />
          Dichiara Risultato
          {isTeamMatch && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              (Solo il capitano può dichiarare)
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Team Status Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Team A Status */}
          <div className={cn(
            'p-3 rounded-lg text-center',
            teamAResult ? 'bg-success/10' : 'bg-secondary'
          )}>
            <p className="text-xs text-muted-foreground mb-1">
              Team A {userTeamSide === 'A' && '(Tu)'}
            </p>
            {teamAResult ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-medium text-success">
                  {teamAResult === 'WIN' ? 'Dichiara Vittoria' : 'Dichiara Sconfitta'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-warning animate-pulse" />
                <span className="font-medium text-warning">In attesa...</span>
              </div>
            )}
          </div>

          {/* Team B Status */}
          <div className={cn(
            'p-3 rounded-lg text-center',
            teamBResult ? 'bg-success/10' : 'bg-secondary'
          )}>
            <p className="text-xs text-muted-foreground mb-1">
              Team B {userTeamSide === 'B' && '(Tu)'}
            </p>
            {teamBResult ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-medium text-success">
                  {teamBResult === 'WIN' ? 'Dichiara Vittoria' : 'Dichiara Sconfitta'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />
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
                  variant="default"
                  className="bg-success hover:bg-success/90 py-6"
                  onClick={() => handleSubmitResult('WIN')}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Trophy className="w-5 h-5 mr-2" />
                      ABBIAMO VINTO
                    </>
                  )}
                </Button>

                <Button
                  size="lg"
                  variant="destructive"
                  className="py-6"
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

              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Attenzione:</strong> Dichiarazioni false possono comportare ban e perdita di coins. 
                  Sii onesto!
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-4 rounded-lg bg-muted/50 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2" />
              <p className="font-medium">In attesa del capitano</p>
              <p className="text-sm">
                Solo il capitano del team può dichiarare il risultato.
              </p>
            </div>
          )
        ) : (
          <div className="text-center py-4 rounded-lg bg-primary/10 text-primary">
            <Clock className="w-8 h-8 mx-auto mb-2 animate-pulse" />
            <p className="font-medium">Risultato Inviato</p>
            <p className="text-sm text-muted-foreground">
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
