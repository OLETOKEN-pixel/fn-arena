import { Link } from 'react-router-dom';
import { Users, Swords } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MatchStatusBadge, RegionBadge, PlatformBadge, ModeBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { LiveTimeBadge } from '@/components/matches/LiveTimeBadge';
import type { Match } from '@/types';
import { cn } from '@/lib/utils';

interface MatchCardProps {
  match: Match;
  onJoin?: (matchId: string) => void;
  isJoining?: boolean;
}

export function MatchCard({ match, onJoin, isJoining }: MatchCardProps) {
  const participantCount = match.participants?.length ?? 0;
  const maxParticipants = match.team_size * 2;
  const isFull = participantCount >= maxParticipants;
  const canJoin = match.status === 'open' && !isFull;

  const isLive = match.status === 'full' || match.status === 'started';

  return (
    <Card className={cn(
      "card-hover bg-card border-border overflow-hidden",
      isLive && "ring-2 ring-success/50"
    )}>
      {/* Header - Status only (no creator info to maintain match anonymity) */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" />
          <span className="font-display font-bold">FN Match</span>
        </div>
        <MatchStatusBadge status={match.status} />
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Mode Badge */}
        <div className="flex items-center justify-center">
          <ModeBadge mode={match.mode} />
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <RegionBadge region={match.region} />
          <PlatformBadge platform={match.platform} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 py-3 border-y border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Entry</p>
            <CoinDisplay amount={match.entry_fee} size="sm" />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Size</p>
            <p className="font-semibold text-sm">{match.team_size}v{match.team_size}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">First to</p>
            <p className="font-semibold text-sm">{match.first_to}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Players</p>
            <p className={cn(
              'font-semibold text-sm',
              isFull && 'text-warning'
            )}>
              {participantCount}/{maxParticipants}
            </p>
          </div>
        </div>

        {/* Timer / Live Badge */}
        <div className="flex items-center justify-center">
          {match.status === 'open' ? (
            <CountdownTimer expiresAt={match.expires_at} />
          ) : (
            <LiveTimeBadge 
              createdAt={match.created_at} 
              startedAt={match.started_at}
              status={match.status} 
            />
          )}
        </div>

        {/* Prize Pool */}
        <div className="text-center py-2 rounded-lg bg-accent/10">
          <p className="text-xs text-muted-foreground mb-1">Prize Pool</p>
          <CoinDisplay 
            amount={match.entry_fee * maxParticipants * 0.95} 
            size="lg" 
            className="glow-text-gold"
          />
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 gap-2">
        <Button 
          variant="outline" 
          className="flex-1"
          asChild
        >
          <Link to={`/matches/${match.id}`}>View Details</Link>
        </Button>
        {canJoin && onJoin && (
          <Button 
            className="flex-1"
            onClick={() => onJoin(match.id)}
            disabled={isJoining}
          >
            {isJoining ? 'Joining...' : match.team_size > 1 ? 'Join with Team' : 'Join Match'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
