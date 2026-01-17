import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Plus, Search, Crown, UserPlus } from 'lucide-react';
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
  const [teamTag, setTeamTag] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
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
    if (!user || !teamName.trim() || !teamTag.trim()) return;

    if (teamTag.length > 5) {
      toast({
        title: 'Invalid tag',
        description: 'Team tag must be 5 characters or less.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);

    try {
      // Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          name: teamName,
          tag: teamTag.toUpperCase(),
          description: teamDescription || null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (teamError) {
        if (teamError.message.includes('unique')) {
          toast({
            title: 'Team exists',
            description: 'A team with this name or tag already exists.',
            variant: 'destructive',
          });
        } else {
          throw teamError;
        }
        return;
      }

      // Add owner as member
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: user.id,
        role: 'owner',
        status: 'accepted',
      });

      toast({
        title: 'Team created!',
        description: `${teamName} has been created successfully.`,
      });

      setCreateOpen(false);
      setTeamName('');
      setTeamTag('');
      setTeamDescription('');

      // Refresh teams
      window.location.reload();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create team.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
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
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tag (max 5 characters)</Label>
                  <Input
                    placeholder="TAG"
                    value={teamTag}
                    onChange={(e) => setTeamTag(e.target.value.slice(0, 5))}
                    maxLength={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Team description"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateTeam}
                  disabled={creating || !teamName.trim() || !teamTag.trim()}
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
            {teams.map((team) => (
              <Card key={team.id} className="bg-card border-border card-hover">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {team.tag}
                      </div>
                      <div>
                        <CardTitle>{team.name}</CardTitle>
                        <CardDescription>
                          {team.members?.length ?? 0} members
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
                  <div className="flex items-center gap-2">
                    {team.members?.slice(0, 5).map((member) => (
                      <Avatar key={member.id} className="w-8 h-8 border-2 border-background">
                        <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {member.profile?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {(team.members?.length ?? 0) > 5 && (
                      <span className="text-sm text-muted-foreground">
                        +{(team.members?.length ?? 0) - 5} more
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
