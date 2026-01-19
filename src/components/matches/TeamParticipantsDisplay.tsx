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
          "flex items-center gap-2 p-2 rounded-lg transition-all border",
          isCurrentUser 
            ? "ring-1 ring-accent/50 bg-accent/10 border-accent/30" 
            : "bg-secondary/40 border-border/30"
        )}
      >
        {/* Avatar with Captain Badge - Compact */}
        <div className="relative flex-shrink-0">
          <Avatar className={cn(
            "w-9 h-9 border",
            teamSide === 'A' ? "border-accent/50" : "border-primary/50"
          )}>
            <AvatarImage src={p.profile?.avatar_url ?? undefined} />
            <AvatarFallback className={cn(
              "text-sm font-bold",
              teamSide === 'A' ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
            )}>
              {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          {isCaptain && (
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
              <Crown className="w-2.5 h-2.5 text-accent-foreground" />
            </div>
          )}
        </div>
        
        {/* Player Info - Compact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn(
              "font-semibold text-sm truncate",
              isCurrentUser && "text-accent"
            )}>
              {p.profile?.username}
            </p>
            {isCurrentUser && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold">YOU</span>
            )}
          </div>
          
          {/* Epic Username */}
          {epicUsername ? (
            <button 
              onClick={() => copyEpicUsername(epicUsername)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span className="truncate max-w-[100px]">{epicUsername}</span>
              <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <p className="text-xs text-destructive/80">No Epic username</p>
          )}
        </div>
        
        {/* Status Indicators - Compact */}
        <div className="flex-shrink-0">
          {showReadyStatus && (
            p.ready ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-[10px] font-bold">Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                <Clock className="w-3 h-3 animate-pulse" />
              </div>
            )
          )}
          
          {showResultStatus && p.result_choice && (
            <div className={cn(
              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
              p.result_choice === 'WIN' 
                ? "bg-success/20 text-success border-success/30" 
                : "bg-destructive/20 text-destructive border-destructive/30"
            )}>
              {p.result_choice}
            </div>
          )}
          
          {isCompleted && isWinner && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30">
              <Trophy className="w-3 h-3 text-accent" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // For 1v1 matches
  if (!isTeamMatch) {
    const player1 = match.participants?.find(p => p.team_side === 'A');
    const player2 = match.participants?.find(p => p.team_side === 'B');

    return (
      <Card className="overflow-hidden border-border/50 bg-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr,auto,1fr] items-stretch">
            {/* Player 1 */}
            <div className="p-3 bg-gradient-to-br from-accent/5 to-transparent">
              <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Host
              </div>
              {player1 ? (
                renderParticipant(player1, true, 'A')
              ) : (
                <div className="flex items-center justify-center py-6 text-muted-foreground border border-dashed border-border/50 rounded-lg">
                  <Users className="w-5 h-5 mr-2 opacity-40" />
                  <span className="text-xs">Waiting...</span>
                </div>
              )}
            </div>

            {/* VS Divider */}
            <div className="flex items-center justify-center px-3 bg-secondary/30">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                <Swords className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Player 2 */}
            <div className="p-3 bg-gradient-to-bl from-primary/5 to-transparent">
              <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1 justify-end">
                Challenger
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              {player2 ? (
                renderParticipant(player2, true, 'B')
              ) : (
                <div className="flex items-center justify-center py-6 text-muted-foreground border border-dashed border-border/50 rounded-lg">
                  <span className="text-xs">Waiting for opponent...</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // For team matches
  return (
    <Card className="overflow-hidden border-border/50 bg-card">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch">
          {/* Team A */}
          <div className="p-3 bg-gradient-to-br from-accent/5 to-transparent">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Host Team
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">
                {match.payment_mode_host === 'cover' ? 'Cover' : 'Split'}
              </span>
            </div>
            
            <div className="space-y-1.5">
              {sortedTeamA.length > 0 ? (
                sortedTeamA.map((p) => renderParticipant(p, p.user_id === teamACaptainId, 'A'))
              ) : (
                <div className="flex items-center justify-center py-4 text-muted-foreground border border-dashed border-border/50 rounded-lg">
                  <Users className="w-4 h-4 mr-2 opacity-40" />
                  <span className="text-xs">Waiting...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamA.length }).map((_, i) => (
                <div 
                  key={`empty-a-${i}`}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border/40 text-muted-foreground/50"
                >
                  <Users className="w-3 h-3" />
                  <span className="text-xs">Empty</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* VS Divider - Desktop */}
          <div className="hidden lg:flex items-center justify-center px-3 bg-secondary/30">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center">
              <Swords className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Mobile VS */}
          <div className="flex lg:hidden items-center justify-center py-2 bg-secondary/30">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center">
              <Swords className="w-3 h-3 text-white" />
            </div>
          </div>
          
          {/* Team B */}
          <div className="p-3 bg-gradient-to-bl from-primary/5 to-transparent">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Challenger
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                {match.payment_mode_joiner === 'cover' ? 'Cover' : 'Split'}
              </span>
            </div>
            
            <div className="space-y-1.5">
              {sortedTeamB.length > 0 ? (
                sortedTeamB.map((p) => renderParticipant(p, p.user_id === teamBCaptainId, 'B'))
              ) : (
                <div className="flex items-center justify-center py-4 text-muted-foreground border border-dashed border-border/50 rounded-lg">
                  <span className="text-xs">Waiting for opponent...</span>
                </div>
              )}
              
              {/* Empty slots */}
              {Array.from({ length: match.team_size - sortedTeamB.length }).map((_, i) => (
                <div 
                  key={`empty-b-${i}`}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border/40 text-muted-foreground/50"
                >
                  <Users className="w-3 h-3" />
                  <span className="text-xs">Empty</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
