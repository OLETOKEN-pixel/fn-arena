import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Plus, Crown, CheckCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Team, TeamMember, Profile } from '@/types';
import { cn } from '@/lib/utils';

interface TeamWithMembers extends Team {
  members: (TeamMember & { profile: Profile })[];
}

export default function Teams() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create team form
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchTeams = async () => {
      // Fetch teams where user is a member
      const { data: memberData } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      const teamIds = memberData?.map(m => m.team_id) ?? [];

      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select(`
            *,
            members:team_members(
              *,
              profile:profiles(*)
            )
          `)
          .in('id', teamIds);

        if (teamsData) {
          setTeams(teamsData as unknown as TeamWithMembers[]);
        }
      }

      setLoading(false);
    };

    fetchTeams();
  }, [user]);

  const handleCreateTeam = async () => {
    if (!user || !teamName.trim()) return;

    setCreating(true);

    try {
      // Use atomic RPC that creates team + owner member in one transaction
      const { data, error } = await supabase.rpc('create_team', {
        p_name: teamName.trim(),
      });

      if (error) throw error;

      const result = data as { success: boolean; team_id?: string; error?: string };

      if (!result.success) {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create team',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Team created!',
        description: `${teamName} has been created. Now invite your teammates!`,
      });

      setCreateOpen(false);
      setTeamName('');

      // Navigate to team details
      navigate(`/teams/${result.team_id}`);
    } catch (error) {
      console.error('Create team error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create team',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const getAcceptedMemberCount = (team: TeamWithMembers) => {
    return team.members?.filter(m => m.status === 'accepted').length ?? 0;
  };

  const getEligibilityBadge = (count: number) => {
    if (count === 2) return '2v2';
    if (count === 3) return '3v3';
    if (count === 4) return '4v4';
    return null; // 1 member = not eligible for team matches
  };

  if (authLoading) return <MainLayout><Skeleton className="h-96" /></MainLayout>;

  return (
    <MainLayout showChat={false}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My Teams</h1>
            <p className="text-muted-foreground">Manage your teams and invites</p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="glow-blue">
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>
                  Create a team to compete in team-based matches.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Team Name</Label>
                  <Input
                    placeholder="Enter team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    A tag will be auto-generated from your team name
                  </p>
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateTeam}
                  disabled={creating || !teamName.trim()}
                >
                  {creating ? 'Creating...' : 'Create Team'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Teams List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Teams Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create a team or accept an invite to get started.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map((team) => {
              const memberCount = getAcceptedMemberCount(team);
              const eligibility = getEligibilityBadge(memberCount);
              
              return (
                <Link key={team.id} to={`/teams/${team.id}`}>
                  <Card className="bg-card border-border card-hover h-full cursor-pointer transition-all hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {team.tag}
                          </div>
                          <div>
                            <CardTitle>{team.name}</CardTitle>
                            <CardDescription>
                              {memberCount}/4 members
                            </CardDescription>
                          </div>
                        </div>
                        {team.owner_id === user?.id && (
                          <Badge variant="accent">
                            <Crown className="w-3 h-3 mr-1" />
                            Owner
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {team.description && (
                        <p className="text-sm text-muted-foreground mb-4">
                          {team.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {team.members?.filter(m => m.status === 'accepted').slice(0, 5).map((member) => (
                            <Avatar key={member.id} className="w-8 h-8 border-2 border-background">
                              <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                              <AvatarFallback className="text-xs">
                                {member.profile?.username?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {memberCount > 5 && (
                            <span className="text-sm text-muted-foreground">
                              +{memberCount - 5} more
                            </span>
                          )}
                        </div>
                        
                        {eligibility && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {eligibility}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
