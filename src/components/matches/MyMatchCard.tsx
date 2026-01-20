import { Link } from 'react-router-dom';
import { Users, Trophy, Clock, CheckCircle2, AlertTriangle, XCircle, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { ModeBadge, RegionBadge } from '@/components/ui/custom-badge';
import { cn } from '@/lib/utils';
import type { Match, MatchStatus } from '@/types';

interface MyMatchCardProps {
  match: Match;
  currentUserId: string;
}

// Status configuration
const statusConfig: Record<MatchStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  open: { label: 'OPEN', variant: 'secondary', icon: <Clock className="w-3 h-3" /> },
  ready_check: { label: 'READY CHECK', variant: 'default', icon: <Users className="w-3 h-3" /> },
  in_progress: { label: 'IN PROGRESS', variant: 'default', icon: <Clock className="w-3 h-3 animate-pulse" /> },
  result_pending: { label: 'SUBMIT RESULT', variant: 'default', icon: <Trophy className="w-3 h-3" /> },
  completed: { label: 'COMPLETED', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3" /> },
  disputed: { label: 'DISPUTED', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3" /> },
  canceled: { label: 'CANCELED', variant: 'outline', icon: <XCircle className="w-3 h-3" /> },
  admin_resolved: { label: 'RESOLVED', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3" /> },
  joined: { label: 'JOINED', variant: 'secondary', icon: <Users className="w-3 h-3" /> },
  full: { label: 'FULL', variant: 'default', icon: <Users className="w-3 h-3" /> },
  started: { label: 'LIVE', variant: 'default', icon: <Clock className="w-3 h-3 animate-pulse" /> },
  finished: { label: 'FINISHED', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3" /> },
  expired: { label: 'EXPIRED', variant: 'outline', icon: <XCircle className="w-3 h-3" /> },
};

export function MyMatchCard({ match, currentUserId }: MyMatchCardProps) {
  const participant = match.participants?.find(p => p.user_id === currentUserId);
  const opponent = match.participants?.find(p => p.user_id !== currentUserId);
  
  const config = statusConfig[match.status] || statusConfig.open;
  
  // Calculate ready count
  const readyCount = match.participants?.filter(p => p.ready).length ?? 0;
  const totalParticipants = match.participants?.length ?? 0;
  
  // Prize pool
  const maxParticipants = match.team_size * 2;
  const prizePool = match.entry_fee * maxParticipants * 0.95;
  
  // Check if user needs to take action
  const needsReadyUp = match.status === 'ready_check' && participant && !participant.ready;
  const needsResult = (match.status === 'in_progress' || match.status === 'result_pending') && participant && !participant.result_choice;
  const actionRequired = needsReadyUp || needsResult;
  
  // Check if user won
  const isWinner = match.result?.winner_user_id === currentUserId;
  const isCompleted = match.status === 'completed' || match.status === 'admin_resolved' || match.status === 'finished';

  // Anonymity: Hide opponent identity until all are ready
  const allReady = match.participants?.every(p => p.ready) ?? false;
  const showOpponentIdentity = match.status !== 'ready_check' || allReady;

  return (
    <Card className={cn(
      'bg-card border-border hover:border-primary/50 transition-all duration-200',
      actionRequired && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      match.status === 'disputed' && 'ring-2 ring-destructive ring-offset-2 ring-offset-background'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={config.variant} className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </Badge>
            {actionRequired && (
              <Badge variant="destructive" className="animate-pulse">
                Action Required
              </Badge>
            )}
          </div>
          {isCompleted && (
            <Badge variant={isWinner ? 'default' : 'secondary'} className={cn(
              isWinner && 'bg-success text-success-foreground'
            )}>
              {isWinner ? 'WON' : 'LOST'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Opponent Info */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">vs</span>
          {opponent ? (
            showOpponentIdentity ? (
              <>
                <Avatar className="w-8 h-8">
                  <AvatarImage src={opponent.profile?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {opponent.profile?.username?.charAt(0).toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{opponent.profile?.username}</p>
                  <p className="text-xs text-muted-foreground">{opponent.profile?.epic_username}</p>
                </div>
              </>
            ) : (
              <>
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <EyeOff className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm text-muted-foreground italic">Hidden</p>
                  <p className="text-xs text-muted-foreground">Ready up to reveal</p>
                </div>
              </>
            )
          ) : (
            <span className="text-muted-foreground text-sm">Waiting for opponent...</span>
          )}
        </div>

        {/* Match Info */}
        <div className="flex flex-wrap gap-2">
          <ModeBadge mode={match.mode} />
          <RegionBadge region={match.region} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">Entry</p>
            <CoinDisplay amount={match.entry_fee} size="sm" />
          </div>
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">Prize</p>
            <CoinDisplay amount={prizePool} size="sm" />
          </div>
          <div className="p-2 rounded bg-secondary">
            <p className="text-xs text-muted-foreground">First to</p>
            <p className="font-bold text-sm">{match.first_to}</p>
          </div>
        </div>

        {/* Ready Status */}
        {match.status === 'ready_check' && (
          <div className="flex items-center justify-between p-2 rounded bg-secondary">
            <span className="text-sm text-muted-foreground">Ready Status</span>
            <div className="flex items-center gap-2">
              <span className="font-bold">{readyCount}/{totalParticipants}</span>
              {participant?.ready ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Clock className="w-4 h-4 text-warning animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button asChild className={cn(
          'w-full',
          actionRequired && 'glow-blue'
        )}>
          <Link to={`/my-matches/${match.id}`}>
            {needsReadyUp ? 'Ready Up' : needsResult ? 'Submit Result' : 'View Details'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
