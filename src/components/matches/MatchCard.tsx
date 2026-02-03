import { Link } from 'react-router-dom';
import { Users, Swords, Zap, Globe, Monitor, Trophy } from 'lucide-react';
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
  const isLive = match.status === 'full' || match.status === 'started' || match.status === 'in_progress';
  const prizePool = match.entry_fee * maxParticipants * 0.95;

  return (
    <Card className={cn(
      "card-premium card-hover overflow-hidden group relative",
      isLive && "ring-1 ring-success/50 glow-success"
    )}>
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between relative bg-secondary/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Swords className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display font-bold">FN Match</span>
        </div>
        <MatchStatusBadge status={match.status} />
      </div>

      <CardContent className="p-4 space-y-4 relative">
        {/* Mode Badge - Prominent */}
        <div className="flex items-center justify-center">
          <ModeBadge mode={match.mode} />
        </div>

        {/* Prize Pool - Hero Section */}
        <div className="text-center py-4 rounded-xl bg-gradient-to-br from-accent/15 via-accent/5 to-transparent border border-accent/20">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Prize Pool</p>
          <div className="flex items-center justify-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />
            <span className="font-display text-3xl font-bold glow-text-gold">
              €{prizePool.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Entry</p>
            <p className="font-mono font-bold text-sm text-primary">€{match.entry_fee}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Size</p>
            <p className="font-mono font-bold text-sm">{match.team_size}v{match.team_size}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">First to</p>
            <p className="font-mono font-bold text-sm">{match.first_to}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-secondary/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Players</p>
            <p className={cn(
              'font-mono font-bold text-sm',
              isFull ? 'text-warning' : 'text-success'
            )}>
              {participantCount}/{maxParticipants}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 justify-center">
          <RegionBadge region={match.region} />
          <PlatformBadge platform={match.platform} />
        </div>

        {/* Timer / Live Badge */}
        <div className="flex items-center justify-center pt-2">
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
      </CardContent>

      <CardFooter className="p-4 pt-0 gap-2 relative">
        <Button 
          variant="outline" 
          className="flex-1 border-border/50 hover:border-primary/50 hover:bg-primary/5"
          asChild
        >
          <Link to={`/matches/${match.id}`}>Dettagli</Link>
        </Button>
        {canJoin && onJoin && (
          <Button 
            className="flex-1 btn-premium"
            variant="gold"
            onClick={() => onJoin(match.id)}
            disabled={isJoining}
          >
            <Zap className="w-4 h-4 mr-1" />
            {isJoining ? 'Joining...' : match.team_size > 1 ? 'Joina' : 'Joina'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
