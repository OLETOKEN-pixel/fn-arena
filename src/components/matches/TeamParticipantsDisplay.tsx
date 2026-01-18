import { Crown, CheckCircle2, Clock, Trophy, Users, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Match, MatchParticipant } from '@/types';

interface TeamParticipantsDisplayProps {
  match: Match;
  currentUserId?: string;
}

export function TeamParticipantsDisplay({ match, currentUserId }: TeamParticipantsDisplayProps) {
  const { toast } = useToast();
  const participantCount = match.participants?.length ?? 0;
  const maxParticipants = match.team_size * 2;
  const isTeamMatch = match.team_size > 1;
  
  const teamAParticipants = match.participants?.filter(p => p.team_side === 'A') ?? [];
  const teamBParticipants = match.participants?.filter(p => p.team_side === 'B') ?? [];
  
  // Sort by join time to identify captain (first joiner)
  const sortedTeamA = [...teamAParticipants].sort((a, b) => 
    new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );
  const sortedTeamB = [...teamBParticipants].sort((a, b) => 
    new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );
  
  const teamACaptainId = sortedTeamA[0]?.user_id;
  const teamBCaptainId = sortedTeamB[0]?.user_id;
  
  const showReadyStatus = match.status === 'ready_check';
  const showResultStatus = match.status === 'in_progress' || match.status === 'result_pending';
  const isCompleted = match.status === 'completed' || match.status === 'admin_resolved';

  const copyEpicUsername = (username: string) => {
    navigator.clipboard.writeText(username);
    toast({
      title: 'Copied!',
      description: `${username} copied to clipboard`,
    });
  };
  
  const renderParticipant = (p: MatchParticipant, isCaptain: boolean, teamSide: 'A' | 'B') => {
    const isCurrentUser = p.user_id === currentUserId;
    const isWinner = match.result?.winner_user_id === p.user_id || 
      (match.result?.winner_team_id && p.team_id === match.result.winner_team_id);
    const epicUsername = p.profile?.epic_username;
    
    return (
      <div 
        key={p.id} 
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-all",
          isCurrentUser && "ring-1 ring-accent/50 bg-accent/5",
          !isCurrentUser && "bg-secondary/30"
        )}
      >
        {/* Avatar with Captain Badge */}
        <div className="relative flex-shrink-0">
          <Avatar className="w-11 h-11 border-2 border-border">
            <AvatarImage src={p.profile?.avatar_url ?? undefined} />
            <AvatarFallback className={cn(
              "text-sm font-semibold",
              teamSide === 'A' ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
            )}>
              {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          {isCaptain && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center shadow-lg">
              <Crown className="w-3 h-3 text-accent-foreground" />
            </div>
          )}
        </div>
        
        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn(
              "font-semibold truncate",
              isCurrentUser && "text-accent"
            )}>
              {p.profile?.username}
            </p>
            {isCurrentUser && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">YOU</span>
            )}
          </div>
          
          {/* Epic Username with Copy */}
          {epicUsername ? (
            <button 
              onClick={() => copyEpicUsername(epicUsername)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span className="truncate">Playing as {epicUsername}</span>
              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <p className="text-xs text-destructive/80">Epic not set</p>
          )}
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showReadyStatus && (
            p.ready ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/10 text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-xs">Waiting</span>
              </div>
            )
          )}
          
          {showResultStatus && p.result_choice && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
              p.result_choice === 'WIN' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            )}>
              {p.result_choice}
            </div>
          )}
          
          {isCompleted && isWinner && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20">
              <Trophy className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-accent">WIN</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // For 1v1 matches, show centered layout
  if (!isTeamMatch) {
    const allParticipants = match.participants ?? [];
    const player1 = allParticipants.find(p => p.team_side === 'A');
    const player2 = allParticipants.find(p => p.team_side === 'B');

    return (
      <Card className="bg-card/50 border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr,auto,1fr] items-stretch">
            {/* Player 1 */}
            <div className="p-4 bg-gradient-to-r from-accent/5 to-transparent">
              {player1 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-accent uppercase tracking-wide">
                    Creating Team
                  </div>
                  {renderParticipant(player1, true, 'A')}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Waiting...</span>
                </div>
              )}
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center px-4 bg-secondary/30">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg glow-gold">
                <span className="text-lg font-bold text-accent-foreground">VS</span>
              </div>
            </div>

            {/* Player 2 */}
            <div className="p-4 bg-gradient-to-l from-primary/5 to-transparent">
              {player2 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Joining Team
                  </div>
                  {renderParticipant(player2, true, 'B')}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Waiting for opponent...</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // For team matches, show enhanced two-column layout
  return (
    <Card className="bg-card/50 border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch">
          {/* Team A Column */}
          <div className="p-4 bg-gradient-to-r from-accent/5 to-transparent">
            {/* Team Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                  Creating Team
                </div>
                <h3 className="text-lg font-bold">Team A</h3>
              </div>
              <div className="text-right">
                <span className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent font-medium">
                  {match.payment_mode_host === 'cover' ? 'Cover All' : 'Split Pay'}
                </span>
              </div>
            </div>
            
            {/* Team A Players */}
            <div className="space-y-2">
              {sortedTeamA.length > 0 ? (
                sortedTeamA.map((p) => renderParticipant(p, p.user_id === teamACaptainId, 'A'))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                  <Users className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Waiting...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamA.length }).map((_, i) => (
                <div 
                  key={`empty-a-${i}`}
                  className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/50 text-muted-foreground/60"
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Empty slot</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* VS Divider */}
          <div className="hidden lg:flex items-center justify-center px-4 bg-secondary/30">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg glow-gold">
              <span className="text-xl font-bold text-accent-foreground">VS</span>
            </div>
          </div>

          {/* Mobile VS Divider */}
          <div className="flex lg:hidden items-center justify-center py-4 bg-secondary/30">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg">
              <span className="text-lg font-bold text-accent-foreground">VS</span>
            </div>
          </div>
          
          {/* Team B Column */}
          <div className="p-4 bg-gradient-to-l from-primary/5 to-transparent">
            {/* Team Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Joining Team
                </div>
                <h3 className="text-lg font-bold">Team B</h3>
              </div>
              <div className="text-right">
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  {match.payment_mode_joiner === 'cover' ? 'Cover All' : 'Split Pay'}
                </span>
              </div>
            </div>
            
            {/* Team B Players */}
            <div className="space-y-2">
              {sortedTeamB.length > 0 ? (
                sortedTeamB.map((p) => renderParticipant(p, p.user_id === teamBCaptainId, 'B'))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                  <Users className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Waiting for opponent...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamB.length }).map((_, i) => (
                <div 
                  key={`empty-b-${i}`}
                  className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/50 text-muted-foreground/60"
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Empty slot</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 py-3 px-4 border-t border-border bg-secondary/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center">
              <Crown className="w-3 h-3 text-accent-foreground" />
            </div>
            <span>Captain</span>
          </div>
          {showReadyStatus && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 bg-success/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                </div>
                <span>Ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 bg-muted rounded-full flex items-center justify-center">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                </div>
                <span>Waiting</span>
              </div>
            </>
          )}
          {isCompleted && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-accent/20 rounded-full flex items-center justify-center">
                <Trophy className="w-3 h-3 text-accent" />
              </div>
              <span>Winner</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
