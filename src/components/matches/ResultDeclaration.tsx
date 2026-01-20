import { useState } from 'react';
import { Trophy, X, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

interface ResultDeclarationProps {
  match: Match;
  currentUserId: string;
  onResultDeclared: () => void;
}

export function ResultDeclaration({ match, currentUserId, onResultDeclared }: ResultDeclarationProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const participant = match.participants?.find(p => p.user_id === currentUserId);
  const opponent = match.participants?.find(p => p.user_id !== currentUserId);
  
  const hasSubmitted = participant?.result_choice !== null && participant?.result_choice !== undefined;
  const opponentSubmitted = opponent?.result_choice !== null && opponent?.result_choice !== undefined;

  const handleSubmitResult = async (result: 'WIN' | 'LOSS') => {
    if (submitting || hasSubmitted) return;

    setSubmitting(true);

    try {
      const { data, error } = await supabase.rpc('submit_match_result', {
        p_match_id: match.id,
        p_result: result,
      });

      if (error) throw error;

      const response = data as { success: boolean; error?: string; status?: string; winner?: string };

      if (!response.success) {
        throw new Error(response.error || 'Failed to submit result');
      }

      if (response.status === 'completed') {
        const isWinner = response.winner === currentUserId;
        toast({
          title: isWinner ? '🎉 Congratulations!' : 'Match Completed',
          description: isWinner 
            ? 'You won! Winnings have been added to your wallet.'
            : 'Better luck next time!',
        });
        
        // Invalidate challenges query for real-time progress update
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
      } else if (response.status === 'disputed') {
        toast({
          title: 'Dispute Opened',
          description: 'Results conflict. An admin will review this match.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Result Submitted',
          description: 'Waiting for opponent to confirm...',
        });
      }

      onResultDeclared();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit result',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // If match is already completed or disputed, don't show
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
          Declare Result
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status */}
        <div className="grid grid-cols-2 gap-4">
          {/* Your Status */}
          <div className={cn(
            'p-3 rounded-lg text-center',
            hasSubmitted ? 'bg-success/10' : 'bg-secondary'
          )}>
            <p className="text-xs text-muted-foreground mb-1">You</p>
            {hasSubmitted ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-medium text-success">
                  {participant?.result_choice === 'WIN' ? 'Claimed Win' : 'Claimed Loss'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-warning animate-pulse" />
                <span className="font-medium text-warning">Pending</span>
              </div>
            )}
          </div>

          {/* Opponent Status */}
          <div className={cn(
            'p-3 rounded-lg text-center',
            opponentSubmitted ? 'bg-success/10' : 'bg-secondary'
          )}>
            <p className="text-xs text-muted-foreground mb-1">
              {opponent?.profile?.username ?? 'Opponent'}
            </p>
            {opponentSubmitted ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-medium text-success">Submitted</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />
                <span className="font-medium text-muted-foreground">Waiting...</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!hasSubmitted ? (
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
                    I WON
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
                    I LOST
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <strong>Warning:</strong> False result claims may result in a ban and loss of coins.
                Be honest!
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-4 rounded-lg bg-primary/10 text-primary">
            <Clock className="w-8 h-8 mx-auto mb-2 animate-pulse" />
            <p className="font-medium">Result Submitted</p>
            <p className="text-sm text-muted-foreground">
              Waiting for opponent to submit their result...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
