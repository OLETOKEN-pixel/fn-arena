import { useState } from 'react';
import { Trophy, XCircle, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Match, MatchResult, Profile } from '@/types';

interface MatchResultDeclarationProps {
  match: Match;
  currentUserId: string;
  onResultDeclared: () => void;
}

export function MatchResultDeclaration({ match, currentUserId, onResultDeclared }: MatchResultDeclarationProps) {
  const { toast } = useToast();
  const [declaring, setDeclaring] = useState(false);

  const result = match.result;
  const isParticipant = match.participants?.some(p => p.user_id === currentUserId);
  const opponent = match.participants?.find(p => p.user_id !== currentUserId);

  // Determine current user's declaration status
  const userDeclaredWin = result?.winner_user_id === currentUserId && result?.winner_confirmed;
  const userDeclaredLoss = result?.winner_user_id !== currentUserId && result?.loser_confirmed;
  const opponentDeclaredWin = result?.winner_user_id === opponent?.user_id && result?.winner_confirmed;
  const opponentDeclaredLoss = result?.winner_user_id === currentUserId && result?.loser_confirmed;

  const handleDeclare = async (iWon: boolean) => {
    setDeclaring(true);
    
    try {
      const { data, error } = await supabase.rpc('declare_match_result', {
        p_match_id: match.id,
        p_i_won: iWon,
      });

      if (error) throw error;

      const resultData = data as { success: boolean; status?: string; error?: string; winner?: string };

      if (!resultData.success) {
        throw new Error(resultData.error || 'Failed to declare result');
      }

      if (resultData.status === 'confirmed') {
        toast({
          title: 'Match completato!',
          description: resultData.winner === currentUserId 
            ? 'Congratulazioni! Hai vinto! 🎉' 
            : 'Match concluso. Il premio è stato assegnato.',
        });
      } else if (resultData.status === 'disputed') {
        toast({
          title: 'Match in disputa',
          description: 'Entrambi i giocatori hanno dichiarato vittoria. Un admin risolverà la disputa.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Risultato registrato',
          description: "In attesa della conferma dell'avversario.",
        });
      }

      onResultDeclared();
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile registrare il risultato. Riprova.',
        variant: 'destructive',
      });
    } finally {
      setDeclaring(false);
    }
  };

  // Don't show if not a participant
  if (!isParticipant) return null;

  // Match must be in progress
  if (match.status !== 'full' && match.status !== 'started') {
    if (match.status === 'finished') {
      return (
        <Card className="bg-success/10 border-success/30">
          <CardContent className="py-6 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success" />
            <p className="text-lg font-semibold text-success">Match Completato</p>
            <p className="text-sm text-muted-foreground">
              Vincitore: {match.participants?.find(p => p.user_id === result?.winner_user_id)?.profile?.username}
            </p>
          </CardContent>
        </Card>
      );
    }
    
    if (match.status === 'disputed') {
      return (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-destructive" />
            <p className="text-lg font-semibold text-destructive">Match in Disputa</p>
            <p className="text-sm text-muted-foreground">
              Un amministratore sta esaminando il caso.
            </p>
          </CardContent>
        </Card>
      );
    }
    
    return null;
  }

  // Show waiting status if user already declared
  if (result && (userDeclaredWin || userDeclaredLoss)) {
    return (
      <Card className="bg-warning/10 border-warning/30">
        <CardContent className="py-6 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-3 text-warning animate-spin" />
          <p className="text-lg font-semibold">In attesa dell'avversario</p>
          <p className="text-sm text-muted-foreground">
            Hai dichiarato: {userDeclaredWin ? 'Vittoria' : 'Sconfitta'}
          </p>
          {opponent?.profile?.username && (
            <p className="text-sm text-muted-foreground mt-1">
              Aspettiamo che {opponent.profile.username} confermi il risultato.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-center">Dichiara il Risultato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Indica l'esito del match. Entrambi i giocatori devono confermare per completare il match.
        </p>

        {/* Show opponent's declaration if any */}
        {result && (opponentDeclaredWin || opponentDeclaredLoss) && (
          <div className="p-3 rounded-lg bg-muted text-center text-sm">
            <span className="text-muted-foreground">
              {opponent?.profile?.username} ha dichiarato:{' '}
            </span>
            <span className="font-medium">
              {opponentDeclaredWin ? 'Vittoria' : 'Sconfitta'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            variant="outline"
            className="h-24 flex-col gap-2 border-destructive/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
            onClick={() => handleDeclare(false)}
            disabled={declaring}
          >
            {declaring ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <XCircle className="w-8 h-8" />
                <span>Ho Perso</span>
              </>
            )}
          </Button>
          <Button
            size="lg"
            className="h-24 flex-col gap-2 bg-success hover:bg-success/90"
            onClick={() => handleDeclare(true)}
            disabled={declaring}
          >
            {declaring ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Trophy className="w-8 h-8" />
                <span>Ho Vinto</span>
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          ⚠️ Dichiarazioni false possono portare a ban permanente.
        </p>
      </CardContent>
    </Card>
  );
}
