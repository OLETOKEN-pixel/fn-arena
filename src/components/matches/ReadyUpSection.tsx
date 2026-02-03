import { useState } from 'react';
import { CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

interface ReadyUpSectionProps {
  match: Match;
  currentUserId: string;
  onReadyChange: () => void;
}

export function ReadyUpSection({ match, currentUserId, onReadyChange }: ReadyUpSectionProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const participant = match.participants?.find(p => p.user_id === currentUserId);
  const isReady = participant?.ready ?? false;
  
  const readyCount = match.participants?.filter(p => p.ready).length ?? 0;
  const totalParticipants = match.participants?.length ?? 0;
  const allReady = readyCount >= totalParticipants && totalParticipants > 0;
  const progressPercent = totalParticipants > 0 ? (readyCount / totalParticipants) * 100 : 0;

  const handleReadyUp = async () => {
    if (isReady || loading) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('set_player_ready', {
        p_match_id: match.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; status?: string; all_ready?: boolean };

      if (!result.success) {
        throw new Error(result.error || 'Failed to set ready');
      }

      if (result.all_ready) {
        toast({
          title: 'Match Started!',
          description: 'All players are ready. Good luck!',
        });
      } else {
        toast({
          title: 'Ready!',
          description: 'Waiting for other players...',
        });
      }

      // Invalidate challenges query for real-time progress update (ready_up_fast)
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      
      onReadyChange();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to ready up',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Ready Check
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {readyCount}/{totalParticipants} Ready
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <Progress value={progressPercent} className="h-2" />

        {/* Participants List */}
        <div className="space-y-2">
          {match.participants?.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg transition-colors',
                p.ready ? 'bg-success/10' : 'bg-secondary'
              )}
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={p.profile?.avatar_url ?? undefined} />
                <AvatarFallback className={cn(
                  'text-sm',
                  p.ready ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                )}>
                  {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <p className="font-medium">{p.profile?.username}</p>
                <p className="text-xs text-muted-foreground">
                  {p.team_side === 'A' ? 'Team A (Host)' : 'Team B'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {p.ready ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="text-sm text-success font-medium">READY</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5 text-muted-foreground animate-pulse" />
                    <span className="text-sm text-muted-foreground">Waiting...</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Ready Up Button */}
        {!isReady && (match.status === 'ready_check' || match.status === 'full') && (
          <Button
            size="lg"
            className="w-full bg-success hover:bg-success/90 glow-green text-lg py-6"
            onClick={handleReadyUp}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Setting Ready...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" />
                READY UP
              </>
            )}
          </Button>
        )}

        {isReady && !allReady && (
          <div className="text-center py-4 rounded-lg bg-success/10 text-success">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
            <p className="font-medium">You're Ready!</p>
            <p className="text-sm text-muted-foreground">Waiting for other players...</p>
          </div>
        )}

        {allReady && (
          <div className="text-center py-4 rounded-lg bg-primary/10 text-primary animate-pulse">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
            <p className="font-medium">All Players Ready!</p>
            <p className="text-sm text-muted-foreground">Match is starting...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
