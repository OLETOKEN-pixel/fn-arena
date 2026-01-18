import { Crown, CheckCircle2, Clock, Trophy, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Match, MatchParticipant } from '@/types';

interface TeamParticipantsDisplayProps {
  match: Match;
  currentUserId?: string;
}

export function TeamParticipantsDisplay({ match, currentUserId }: TeamParticipantsDisplayProps) {
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
  
  const renderParticipant = (p: MatchParticipant, isCaptain: boolean) => {
    const isCurrentUser = p.user_id === currentUserId;
    const isWinner = match.result?.winner_user_id === p.user_id || 
      (match.result?.winner_team_id && p.team_id === match.result.winner_team_id);
    
    return (
      <div 
        key={p.id} 
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-colors",
          isCurrentUser ? "bg-primary/10 border border-primary/20" : "bg-secondary/50"
        )}
      >
        <div className="relative">
          <Avatar className="w-10 h-10">
            <AvatarImage src={p.profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {p.profile?.username?.charAt(0).toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          {isCaptain && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-warning rounded-full flex items-center justify-center">
              <Crown className="w-3 h-3 text-warning-foreground" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-medium truncate",
            isCurrentUser && "text-primary"
          )}>
            {p.profile?.username}
            {isCurrentUser && <span className="text-xs ml-1">(Tu)</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {p.profile?.epic_username ?? 'Epic non impostato'}
          </p>
        </div>
        
        {/* Status indicators */}
        <div className="flex items-center gap-2">
          {showReadyStatus && (
            p.ready ? (
              <div className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-xs">In attesa</span>
              </div>
            )
          )}
          
          {showResultStatus && p.result_choice && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded",
              p.result_choice === 'WIN' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            )}>
              {p.result_choice === 'WIN' ? 'WIN' : 'LOSS'}
            </div>
          )}
          
          {isCompleted && isWinner && (
            <Trophy className="w-5 h-5 text-warning" />
          )}
        </div>
      </div>
    );
  };

  // For 1v1 matches, show simple list
  if (!isTeamMatch) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Partecipanti ({participantCount}/{maxParticipants})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {match.participants && match.participants.length > 0 ? (
            <div className="space-y-3">
              {match.participants.map((p) => renderParticipant(p, false))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Nessun partecipante ancora.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // For team matches, show two-column layout
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Partecipanti ({participantCount}/{maxParticipants})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Team A Column */}
          <div className="space-y-3">
            <div className={cn(
              "flex items-center justify-between px-3 py-2 rounded-lg font-semibold",
              "bg-primary/10 text-primary"
            )}>
              <span>Team A</span>
              <span className="text-xs font-normal">
                {match.payment_mode_host === 'cover' ? 'Cover All' : 'Split Pay'}
              </span>
            </div>
            
            {sortedTeamA.length > 0 ? (
              <div className="space-y-2">
                {sortedTeamA.map((p) => renderParticipant(p, p.user_id === teamACaptainId))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-lg">
                In attesa...
              </div>
            )}
            
            {/* Empty slots */}
            {Array.from({ length: match.team_size - sortedTeamA.length }).map((_, i) => (
              <div 
                key={`empty-a-${i}`}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border text-muted-foreground"
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">Slot vuoto</span>
              </div>
            ))}
          </div>
          
          {/* VS Divider (visible on larger screens) */}
          <div className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {/* This is handled by the grid gap */}
          </div>
          
          {/* Team B Column */}
          <div className="space-y-3">
            <div className={cn(
              "flex items-center justify-between px-3 py-2 rounded-lg font-semibold",
              "bg-destructive/10 text-destructive"
            )}>
              <span>Team B</span>
              <span className="text-xs font-normal">
                {match.payment_mode_joiner === 'cover' ? 'Cover All' : 'Split Pay'}
              </span>
            </div>
            
            {sortedTeamB.length > 0 ? (
              <div className="space-y-2">
                {sortedTeamB.map((p) => renderParticipant(p, p.user_id === teamBCaptainId))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-lg">
                In attesa avversario...
              </div>
            )}
            
            {/* Empty slots */}
            {Array.from({ length: match.team_size - sortedTeamB.length }).map((_, i) => (
              <div 
                key={`empty-b-${i}`}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border text-muted-foreground"
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">Slot vuoto</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-warning rounded-full flex items-center justify-center">
              <Crown className="w-2.5 h-2.5 text-warning-foreground" />
            </div>
            <span>Capitano</span>
          </div>
          {showReadyStatus && (
            <>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Pronto</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>In attesa</span>
              </div>
            </>
          )}
          {isCompleted && (
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-warning" />
              <span>Vincitore</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
