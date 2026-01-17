import { useState } from 'react';
import { AlertTriangle, Trophy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/types';

interface DisputeManagerProps {
  matches: Match[];
  onResolved: () => void;
}

export function DisputeManager({ matches, onResolved }: DisputeManagerProps) {
  const { toast } = useToast();
  const [resolvingMatch, setResolvingMatch] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const disputedMatches = matches.filter(m => m.status === 'disputed');

  const handleResolve = async (matchId: string, winnerId: string) => {
    setResolvingMatch(matchId);

    try {
      const { data, error } = await supabase.rpc('admin_resolve_dispute', {
        p_match_id: matchId,
        p_winner_user_id: winnerId,
        p_admin_notes: adminNotes[matchId] || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to resolve dispute');
      }

      toast({
        title: 'Disputa risolta',
        description: 'Il vincitore è stato dichiarato e il premio assegnato.',
      });

      onResolved();
    } catch (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile risolvere la disputa.',
        variant: 'destructive',
      });
    } finally {
      setResolvingMatch(null);
    }
  };

  if (disputedMatches.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Nessuna disputa da risolvere 🎉</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {disputedMatches.map((match) => (
        <Card key={match.id} className="bg-destructive/5 border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Disputa - {match.mode}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Match Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Region: </span>
                <span>{match.region}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Entry Fee: </span>
                <span>{match.entry_fee} Coins</span>
              </div>
            </div>

            {/* Participants */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Partecipanti:</p>
              <div className="grid grid-cols-2 gap-4">
                {match.participants?.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.profile?.username}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.profile?.epic_username}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-success hover:bg-success/90"
                      onClick={() => handleResolve(match.id, p.user_id)}
                      disabled={resolvingMatch === match.id}
                    >
                      {resolvingMatch === match.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Trophy className="w-4 h-4 mr-1" />
                          Vincitore
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Note Admin</label>
              <Textarea
                placeholder="Motivazione della decisione..."
                value={adminNotes[match.id] || ''}
                onChange={(e) => setAdminNotes({ ...adminNotes, [match.id]: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
