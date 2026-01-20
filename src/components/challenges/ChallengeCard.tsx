import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Challenge } from '@/hooks/useChallenges';
import { ClaimButton } from './ClaimButton';
import { CoinIcon } from '@/components/common/CoinIcon';
import { Zap, Gamepad2, Clock, Camera, Sparkles, Check } from 'lucide-react';

interface ChallengeCardProps {
  challenge: Challenge;
  onClaim: (challengeId: string, periodKey: string) => Promise<unknown>;
  isClaiming: boolean;
}

const metricIcons: Record<string, React.ReactNode> = {
  match_completed: <Gamepad2 className="w-5 h-5" />,
  ready_up_fast: <Clock className="w-5 h-5" />,
  proof_uploaded: <Camera className="w-5 h-5" />,
  match_created_started: <Sparkles className="w-5 h-5" />,
};

export const ChallengeCard = memo(function ChallengeCard({
  challenge,
  onClaim,
  isClaiming,
}: ChallengeCardProps) {
  const progressPercent = Math.min(
    (challenge.progress_value / challenge.target_value) * 100,
    100
  );

  const isCompleted = challenge.is_completed;
  const isClaimed = challenge.is_claimed;
  const canClaim = isCompleted && !isClaimed;

  const handleClaim = async () => {
    await onClaim(challenge.id, challenge.period_key);
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        'border-border/50 bg-card/80 backdrop-blur-sm',
        canClaim && 'border-accent/50 shadow-[0_0_20px_-5px_hsl(var(--accent)/0.3)]',
        isClaimed && 'opacity-60'
      )}
    >
      {/* Glow effect for claimable */}
      {canClaim && (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
      )}

      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'p-2 rounded-lg',
                canClaim
                  ? 'bg-accent/20 text-accent'
                  : isClaimed
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {metricIcons[challenge.metric_type] || <Zap className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">
                {challenge.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {challenge.description}
              </p>
            </div>
          </div>

          {/* Status badge */}
          {isClaimed && (
            <Badge variant="outline" className="shrink-0 text-xs border-green-500/50 text-green-500">
              <Check className="w-3 h-3 mr-1" />
              Claimed
            </Badge>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className={cn('font-medium', isCompleted && 'text-green-500')}>
              {challenge.progress_value}/{challenge.target_value}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn(
              'h-2',
              isCompleted && '[&>div]:bg-green-500'
            )}
          />
        </div>

        {/* Reward + Action */}
        <div className="flex items-center justify-between pt-1">
          {/* Reward */}
          <div className="flex items-center gap-2">
            {challenge.reward_xp > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                <Zap className="w-3 h-3 mr-1 text-yellow-500" />
                +{challenge.reward_xp} XP
              </Badge>
            )}
            {challenge.reward_coin > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                <CoinIcon size="xs" className="mr-1" />
                +{challenge.reward_coin}
              </Badge>
            )}
          </div>

          {/* Action */}
          {canClaim ? (
            <ClaimButton onClick={handleClaim} isLoading={isClaiming} />
          ) : !isClaimed ? (
            <Badge variant="outline" className="text-xs">
              Active
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});
