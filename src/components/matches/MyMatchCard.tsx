import { Link } from 'react-router-dom';
import { Users, Trophy, Clock, CheckCircle2, AlertTriangle, XCircle, EyeOff, Zap, Swords, Crown, Skull } from 'lucide-react';
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

// Status configuration with premium styling
const statusConfig: Record<MatchStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline'; 
  icon: React.ReactNode;
  glow?: string;
}> = {
  open: { label: 'OPEN', variant: 'secondary', icon: <Clock className="w-3 h-3" /> },
  ready_check: { label: 'READY CHECK', variant: 'default', icon: <Zap className="w-3 h-3" />, glow: 'glow-blue-soft' },
  in_progress: { label: 'LIVE', variant: 'default', icon: <Swords className="w-3 h-3 animate-pulse" />, glow: 'glow-success' },
  result_pending: { label: 'SUBMIT RESULT', variant: 'default', icon: <Trophy className="w-3 h-3" />, glow: 'glow-gold-soft' },
  completed: { label: 'COMPLETED', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3" /> },
  disputed: { label: 'DISPUTED', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3" /> },
  canceled: { label: 'CANCELED', variant: 'outline', icon: <XCircle className="w-3 h-3" /> },
  admin_resolved: { label: 'RESOLVED', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3" /> },
  joined: { label: 'JOINED', variant: 'secondary', icon: <Users className="w-3 h-3" /> },
  full: { label: 'READY CHECK', variant: 'default', icon: <Zap className="w-3 h-3" />, glow: 'glow-blue-soft' },
  started: { label: 'LIVE', variant: 'default', icon: <Swords className="w-3 h-3 animate-pulse" />, glow: 'glow-success' },
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
  const needsReadyUp = (match.status === 'ready_check' || match.status === 'full') && participant && !participant.ready;
  const needsResult = (match.status === 'in_progress' || match.status === 'result_pending') && participant && !participant.result_choice;
  const actionRequired = needsReadyUp || needsResult;
  
  // Check if user won
  const isWinner = match.result?.winner_user_id === currentUserId;
  const isCompleted = match.status === 'completed' || match.status === 'admin_resolved' || match.status === 'finished';

  // Anonymity: Hide opponent identity until all are ready OR match is completed
  const allReady = match.participants?.every(p => p.ready) ?? false;
  const showOpponentIdentity = isCompleted || (match.status !== 'ready_check' && match.status !== 'full') || allReady;

  return (
    <Card className={cn(
      'card-premium card-hover overflow-hidden relative group',
      actionRequired && 'ring-2 ring-primary/50 animate-pulse-glow',
      match.status === 'disputed' && 'ring-2 ring-destructive/50',
      isCompleted && isWinner && 'ring-1 ring-accent/30',
      config.glow
    )}>
      {/* Action Required Overlay */}
      {actionRequired && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
      )}

      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={config.variant} className={cn(
              "flex items-center gap-1.5 px-2.5 py-1",
              match.status === 'in_progress' && 'bg-success text-success-foreground'
            )}>
              {config.icon}
              {config.label}
            </Badge>
            {actionRequired && (
              <Badge variant="destructive" className="animate-pulse flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Action Required
              </Badge>
            )}
          </div>
          {isCompleted && (
            <Badge variant={isWinner ? 'default' : 'secondary'} className={cn(
              "flex items-center gap-1.5 px-3",
              isWinner ? 'bg-gradient-to-r from-accent to-accent-glow text-accent-foreground glow-gold-soft' : 'bg-muted'
            )}>
              {isWinner ? <Crown className="w-3 h-3" /> : <Skull className="w-3 h-3" />}
              {isWinner ? 'WON' : 'LOST'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 relative">
        {/* VS Section - Premium */}
        <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/50 border border-border/50">
          {/* Current User */}
          <div className="flex-1 flex items-center gap-2">
            <Avatar className="w-10 h-10 ring-2 ring-primary/30">
              <AvatarImage src={participant?.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {participant?.profile?.username?.charAt(0).toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{participant?.profile?.username ?? 'You'}</p>
              <p className="text-xs text-muted-foreground truncate">{participant?.profile?.epic_username}</p>
            </div>
          </div>

          {/* VS Badge */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-border">
              <span className="font-display font-bold text-sm">VS</span>
            </div>
          </div>

          {/* Opponent */}
          <div className="flex-1 flex items-center gap-2 justify-end text-right">
            {opponent ? (
              showOpponentIdentity ? (
                <>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{opponent.profile?.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{opponent.profile?.epic_username}</p>
                  </div>
                  <Avatar className="w-10 h-10 ring-2 ring-border">
                    <AvatarImage src={opponent.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                      {opponent.profile?.username?.charAt(0).toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                </>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-sm text-muted-foreground italic">Hidden</p>
                    <p className="text-xs text-muted-foreground">Ready up to reveal</p>
                  </div>
                  <Avatar className="w-10 h-10 ring-2 ring-muted">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <EyeOff className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                </>
              )
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Waiting...</p>
                </div>
                <Avatar className="w-10 h-10 ring-2 ring-dashed ring-border">
                  <AvatarFallback className="bg-transparent text-muted-foreground">
                    <Users className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              </>
            )}
          </div>
        </div>

        {/* Match Info Tags */}
        <div className="flex flex-wrap gap-2 justify-center">
          <ModeBadge mode={match.mode} />
          <RegionBadge region={match.region} />
        </div>

        {/* Stats Grid - Premium */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-secondary/50 text-center border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry</p>
            <p className="font-mono font-bold text-sm text-primary">€{match.entry_fee}</p>
          </div>
          <div className="p-3 rounded-xl bg-gradient-to-br from-accent/10 to-transparent text-center border border-accent/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prize</p>
            <p className="font-mono font-bold text-sm text-accent">€{prizePool.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/50 text-center border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">First to</p>
            <p className="font-mono font-bold text-sm">{match.first_to}</p>
          </div>
        </div>

        {/* Ready Status - Premium */}
        {(match.status === 'ready_check' || match.status === 'full') && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Ready Status
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[...Array(totalParticipants)].map((_, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      i < readyCount ? "bg-success" : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <span className="font-mono font-bold">{readyCount}/{totalParticipants}</span>
              {participant?.ready ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <Clock className="w-5 h-5 text-warning animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Action Button - Premium */}
        <Button 
          asChild 
          className={cn(
            'w-full h-12',
            actionRequired ? 'btn-premium glow-blue' : 'btn-premium'
          )}
          variant={actionRequired ? 'default' : 'outline'}
        >
          <Link to={`/my-matches/${match.id}`} className="flex items-center justify-center gap-2">
            {needsReadyUp && <Zap className="w-4 h-4" />}
            {needsResult && <Trophy className="w-4 h-4" />}
            <span className="font-display font-bold">
              {needsReadyUp ? 'Ready Up Now' : needsResult ? 'Submit Result' : 'View Details'}
            </span>
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
