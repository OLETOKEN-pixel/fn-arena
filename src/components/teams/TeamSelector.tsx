import { useState } from 'react';
import { Users, AlertCircle, Check, Coins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { Button } from '@/components/ui/button';
import { useEligibleTeams } from '@/hooks/useEligibleTeams';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { Team, TeamMember, Profile, TeamMemberWithBalance } from '@/types';

interface TeamWithMembersAndBalance extends Team {
  members: (TeamMember & { profile: Profile })[];
  memberBalances?: TeamMemberWithBalance[];
  acceptedMemberCount: number;
}

interface TeamSelectorProps {
  teamSize: number;
  entryFee: number;
  selectedTeamId: string | null;
  onSelectTeam: (team: TeamWithMembersAndBalance | null) => void;
  paymentMode: 'cover' | 'split';
}

export function TeamSelector({
  teamSize,
  entryFee,
  selectedTeamId,
  onSelectTeam,
  paymentMode,
}: TeamSelectorProps) {
  const { eligibleTeams, loading } = useEligibleTeams(teamSize, entryFee);

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading teams...
      </div>
    );
  }

  if (eligibleTeams.length === 0) {
    return (
      <Card className="bg-secondary/50 border-dashed">
        <CardContent className="py-6 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="font-semibold mb-2">No Eligible Teams</h4>
          <p className="text-sm text-muted-foreground mb-4">
            You need a team with exactly {teamSize} members for {teamSize}v{teamSize} matches.
          </p>
          <div className="flex gap-2 justify-center">
            <Button asChild variant="outline">
              <Link to="/teams">Manage Teams</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {eligibleTeams.map((team) => {
        const isSelected = selectedTeamId === team.id;
        const insufficientMembers = paymentMode === 'split' 
          ? team.memberBalances?.filter(m => !m.has_sufficient_balance) ?? []
          : [];
        const canSelect = paymentMode === 'cover' || insufficientMembers.length === 0;

        return (
          <Card
            key={team.id}
            className={cn(
              "cursor-pointer transition-all border-2",
              isSelected 
                ? "border-primary bg-primary/5" 
                : "border-transparent hover:border-primary/50",
              !canSelect && "opacity-60 cursor-not-allowed"
            )}
            onClick={() => canSelect && onSelectTeam(isSelected ? null : team)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {team.tag}
                  </div>
                  <div>
                    <h4 className="font-semibold">{team.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {team.acceptedMemberCount} members
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Member Avatars */}
                  <div className="flex -space-x-2">
                    {team.members?.slice(0, 4).map((member) => (
                      <Avatar key={member.id} className="w-7 h-7 border-2 border-background">
                        <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {member.profile?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>

                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {paymentMode === 'split' && insufficientMembers.length > 0 && (
                <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <Coins className="w-4 h-4" />
                    <span>
                      Insufficient balance: {insufficientMembers.map(m => m.username).join(', ')}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
