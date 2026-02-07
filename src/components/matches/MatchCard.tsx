import { Link } from 'react-router-dom';
import { Zap, ArrowRight, Crown } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MatchStatusBadge, RegionBadge, PlatformBadge } from '@/components/ui/custom-badge';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CoinIcon } from '@/components/common/CoinIcon';
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

  const modeTitle = `${match.team_size}V${match.team_size} ${match.mode.toUpperCase()}`;

  return (
    <Card className={cn(
      "card-premium card-hover overflow-hidden group relative",
      isLive && "ring-1 ring-success/50 glow-success"
    )}>
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {/* Header: Status + Timer */}
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between relative bg-secondary/20">
        <MatchStatusBadge status={match.status} />
        <div className="text-sm">
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
      </div>

      {/* Clickable body */}
      <Link to={`/matches/${match.id}`} className="block">
        <CardContent className="p-5 space-y-5 relative">
          {/* Mode Title - Big and bold */}
          <div className="text-center">
            <h3 className="font-display text-xl lg:text-2xl font-bold tracking-tight">
              {modeTitle}
            </h3>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <RegionBadge region={match.region} />
            <PlatformBadge platform={match.platform} />
          </div>

          {/* First To */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">First To</p>
            <p className="font-display text-3xl font-bold text-primary">
              FT {match.first_to}
            </p>
          </div>

          {/* Entry Fee → Prize */}
          <div className="flex items-center justify-center gap-4 py-4 rounded-xl bg-secondary/40 border border-border/30">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Entry</p>
              <div className="flex items-center gap-1.5">
                <CoinIcon size="sm" />
                <span className="font-mono text-xl font-bold">{match.entry_fee}</span>
              </div>
            </div>
            
            <ArrowRight className="w-5 h-5 text-muted-foreground" />

            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Prize</p>
              <div className="flex items-center gap-1.5">
                <CoinIcon size="sm" />
                <span className="font-mono text-xl font-bold text-accent glow-text-gold">
                  {prizePool.toFixed(2)}
                </span>
                <Crown className="w-4 h-4 text-accent/70" />
              </div>
            </div>
          </div>
        </CardContent>
      </Link>

      {/* CTA */}
      {canJoin && onJoin && (
        <CardFooter className="p-5 pt-0 relative">
          <Button 
            className="w-full h-13 lg:h-14 text-base lg:text-lg font-display font-bold btn-gold active-scale"
            variant="gold"
            onClick={(e) => {
              e.preventDefault();
              onJoin(match.id);
            }}
            disabled={isJoining}
          >
            <Zap className="w-5 h-5 mr-2" />
            {isJoining ? 'Joining...' : 'JOIN MATCH'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
