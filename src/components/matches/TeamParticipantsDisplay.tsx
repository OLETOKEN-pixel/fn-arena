import { Crown, CheckCircle2, Clock, Trophy, Users, Copy, Swords } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
          "flex items-center gap-4 p-4 rounded-xl transition-all border",
          isCurrentUser 
            ? "ring-2 ring-accent/50 bg-accent/10 border-accent/30" 
            : "bg-secondary/40 border-border/30 hover:bg-secondary/60"
        )}
      >
        {/* Avatar with Captain Badge - Larger */}
        <div className="relative flex-shrink-0">
          <Avatar className={cn(
            "w-14 h-14 border-2",
            teamSide === 'A' ? "border-accent/50" : "border-primary/50"
          )}>
            <AvatarImage src={p.profile?.avatar_url ?? undefined} />
            <AvatarFallback className={cn(
              "text-lg font-bold",
              teamSide === 'A' ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
            )}>
              {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          {isCaptain && (
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-accent to-accent/80 rounded-full flex items-center justify-center shadow-lg shadow-accent/30">
              <Crown className="w-3.5 h-3.5 text-accent-foreground" />
            </div>
          )}
        </div>
        
        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn(
              "font-bold text-base truncate",
              isCurrentUser && "text-accent"
            )}>
              {p.profile?.username}
            </p>
            {isCurrentUser && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold uppercase tracking-wide">YOU</span>
            )}
          </div>
          
          {/* Epic Username with Copy */}
          {epicUsername ? (
            <button 
              onClick={() => copyEpicUsername(epicUsername)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group mt-1"
            >
              <span className="truncate">{epicUsername}</span>
              <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <p className="text-sm text-destructive/80 mt-1">Epic username not set</p>
          )}
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showReadyStatus && (
            p.ready ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/20 text-success border border-success/30">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-medium">Waiting</span>
              </div>
            )
          )}
          
          {showResultStatus && p.result_choice && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1.5 rounded-full border",
              p.result_choice === 'WIN' 
                ? "bg-success/20 text-success border-success/30" 
                : "bg-destructive/20 text-destructive border-destructive/30"
            )}>
              {p.result_choice}
            </div>
          )}
          
          {isCompleted && isWinner && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/20 border border-accent/30">
              <Trophy className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-accent uppercase">Winner</span>
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
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-secondary/10">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr,auto,1fr] items-stretch min-h-[200px]">
            {/* Player 1 - Team A */}
            <div className="p-6 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent">
              <div className="text-xs font-bold text-accent uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                Host
              </div>
              {player1 ? (
                renderParticipant(player1, true, 'A')
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Users className="w-10 h-10 mb-3 opacity-40" />
                  <span className="text-sm font-medium">Waiting...</span>
                </div>
              )}
            </div>

            {/* VS Divider - Premium */}
            <div className="flex items-center justify-center px-6 bg-gradient-to-b from-secondary/50 via-secondary/30 to-secondary/50">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent via-accent/80 to-primary flex items-center justify-center shadow-2xl shadow-accent/30 glow-gold">
                <Swords className="w-8 h-8 text-accent-foreground" />
              </div>
            </div>

            {/* Player 2 - Team B */}
            <div className="p-6 bg-gradient-to-bl from-primary/10 via-primary/5 to-transparent">
              <div className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2 justify-end">
                Challenger
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              {player2 ? (
                renderParticipant(player2, true, 'B')
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Users className="w-10 h-10 mb-3 opacity-40" />
                  <span className="text-sm font-medium">Waiting for opponent...</span>
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
    <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-secondary/10">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch">
          {/* Team A Column */}
          <div className="p-6 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent">
            {/* Team Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-accent uppercase tracking-widest mb-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  Host Team
                </div>
                <h3 className="text-xl font-bold">Team A</h3>
              </div>
              <div>
                <span className="text-xs px-3 py-1.5 rounded-full bg-accent/20 text-accent font-bold uppercase tracking-wide border border-accent/30">
                  {match.payment_mode_host === 'cover' ? 'Cover All' : 'Split Pay'}
                </span>
              </div>
            </div>
            
            {/* Team A Players */}
            <div className="space-y-3">
              {sortedTeamA.length > 0 ? (
                sortedTeamA.map((p) => renderParticipant(p, p.user_id === teamACaptainId, 'A'))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Users className="w-10 h-10 mb-3 opacity-40" />
                  <span className="text-sm font-medium">Waiting for team...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamA.length }).map((_, i) => (
                <div 
                  key={`empty-a-${i}`}
                  className="flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-border/40 text-muted-foreground/50"
                >
                  <Users className="w-5 h-5" />
                  <span className="text-sm font-medium">Empty slot</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* VS Divider - Desktop */}
          <div className="hidden lg:flex items-center justify-center px-6 bg-gradient-to-b from-secondary/50 via-secondary/30 to-secondary/50">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent via-accent/80 to-primary flex items-center justify-center shadow-2xl shadow-accent/30 glow-gold">
              <Swords className="w-8 h-8 text-accent-foreground" />
            </div>
          </div>

          {/* Mobile VS Divider */}
          <div className="flex lg:hidden items-center justify-center py-6 bg-secondary/30">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent via-accent/80 to-primary flex items-center justify-center shadow-xl">
              <Swords className="w-6 h-6 text-accent-foreground" />
            </div>
          </div>
          
          {/* Team B Column */}
          <div className="p-6 bg-gradient-to-bl from-primary/10 via-primary/5 to-transparent">
            {/* Team Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Challenger Team
                </div>
                <h3 className="text-xl font-bold">Team B</h3>
              </div>
              <div>
                <span className="text-xs px-3 py-1.5 rounded-full bg-primary/20 text-primary font-bold uppercase tracking-wide border border-primary/30">
                  {match.payment_mode_joiner === 'cover' ? 'Cover All' : 'Split Pay'}
                </span>
              </div>
            </div>
            
            {/* Team B Players */}
            <div className="space-y-3">
              {sortedTeamB.length > 0 ? (
                sortedTeamB.map((p) => renderParticipant(p, p.user_id === teamBCaptainId, 'B'))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Users className="w-10 h-10 mb-3 opacity-40" />
                  <span className="text-sm font-medium">Waiting for opponent...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamB.length }).map((_, i) => (
                <div 
                  key={`empty-b-${i}`}
                  className="flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed border-border/40 text-muted-foreground/50"
                >
                  <Users className="w-5 h-5" />
                  <span className="text-sm font-medium">Empty slot</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 py-4 px-6 border-t border-border/30 bg-secondary/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-accent to-accent/80 rounded-full flex items-center justify-center shadow-md">
              <Crown className="w-3.5 h-3.5 text-accent-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Captain</span>
          </div>
          {showReadyStatus && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-success/20 rounded-full flex items-center justify-center border border-success/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                </div>
                <span className="text-sm text-muted-foreground">Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center border border-border">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Waiting</span>
              </div>
            </>
          )}
          {isCompleted && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center border border-accent/30">
                <Trophy className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="text-sm text-muted-foreground">Winner</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
