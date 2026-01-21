import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Crown, UserPlus, Users, LogOut, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { InviteMemberForm } from '@/components/teams/InviteMemberForm';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Team, TeamMember, Profile } from '@/types';
import { cn } from '@/lib/utils';

interface TeamWithMembers extends Team {
  members: (TeamMember & { profile: Profile })[];
}

export default function TeamDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [team, setTeam] = useState<TeamWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const fetchTeam = async () => {
    if (!id) return;
    
    const { data, error } = await supabase
      .from('teams')
      .select(`
        *,
        members:team_members(
          *,
          profile:profiles_public!team_members_user_id_fkey(user_id, username, avatar_url, epic_username)
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // Show actual error message for debugging
      console.error('Team fetch error:', error);
      toast({
        title: 'Error loading team',
        description: `${error.message} (code: ${error.code})`,
        variant: 'destructive',
      });
      navigate('/teams');
      return;
    }
    
    if (!data) {
      toast({
        title: 'Team not found',
        description: 'The team you are looking for does not exist.',
        variant: 'destructive',
      });
      navigate('/teams');
      return;
    }

    setTeam(data as unknown as TeamWithMembers);
    setLoading(false);
  };

  useEffect(() => {
    fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = team?.owner_id === user?.id;
  const acceptedMembers = team?.members?.filter(m => m.status === 'accepted') ?? [];
  const pendingMembers = team?.members?.filter(m => m.status === 'pending') ?? [];
  const memberCount = acceptedMembers.length;
  const maxMembers = 4;

  const getEligibilityText = () => {
    if (memberCount === 0) return 'No members';
    if (memberCount === 1) return 'Invite 1 more for 2v2';
    if (memberCount === 2) return 'Eligible for 2v2';
    if (memberCount === 3) return 'Eligible for 3v3';
    if (memberCount === 4) return 'Eligible for 4v4';
    return '';
  };

  const handleLeaveTeam = async () => {
    if (!team) return;
    
    setLeaving(true);
    try {
      const { data, error } = await supabase.rpc('leave_team', {
        p_team_id: team.id,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error);
      }

      toast({
        title: 'Left team',
        description: `You have left ${team.name}`,
      });
      navigate('/teams');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to leave team',
        variant: 'destructive',
      });
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!team) return;
    
    if (!confirm(`Sei sicuro di voler eliminare il team "${team.name}"? Tutti i membri verranno rimossi. Questa azione è irreversibile.`)) {
      return;
    }
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_team', {
        p_team_id: team.id,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error);
      }

      toast({
        title: 'Team eliminato',
        description: `Il team ${team.name} è stato eliminato.`,
      });
      navigate('/teams');
    } catch (error) {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile eliminare il team',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;
    
    setRemovingMember(memberId);
    try {
      const { data, error } = await supabase.rpc('remove_team_member', {
        p_team_id: team.id,
        p_user_id: memberId,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error);
      }

      toast({
        title: 'Member removed',
        description: 'The member has been removed from the team.',
      });
      
      // Refresh team data
      setTeam(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.user_id !== memberId),
      } : null);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member',
        variant: 'destructive',
      });
    } finally {
      setRemovingMember(null);
    }
  };

  const handleInviteSent = () => {
    toast({
      title: 'Invite sent!',
      description: 'The user will receive a notification.',
    });
    // Refresh team to show pending invite
    fetchTeam();
  };

  if (authLoading || loading) {
    return (
      <MainLayout showChat={false}>
        <Skeleton className="h-96" />
      </MainLayout>
    );
  }

  if (!team) {
    return (
      <MainLayout showChat={false}>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Team Not Found</h1>
          <Button asChild>
            <Link to="/teams">Back to Teams</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showChat={false}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back button */}
        <Link
          to="/teams"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teams
        </Link>

        {/* Team Header */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                  {team.tag}
                </div>
                <div>
                  <CardTitle className="text-2xl">{team.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Users className="w-4 h-4" />
                    {memberCount}/{maxMembers} members
                  </CardDescription>
                </div>
              </div>
              {isOwner && (
                <Badge variant="accent">
                  <Crown className="w-3 h-3 mr-1" />
                  Owner
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Member Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Team Size</span>
                <span className="font-medium">{memberCount}/4</span>
              </div>
              <Progress value={(memberCount / maxMembers) * 100} className="h-2" />
            </div>

            {/* Eligibility Badge */}
            <div className="flex items-center gap-2">
              <Badge variant={memberCount >= 2 ? 'default' : 'outline'}>
                <CheckCircle className={cn("w-3 h-3 mr-1", memberCount >= 2 ? "text-primary-foreground" : "text-muted-foreground")} />
                {getEligibilityText()}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {isOwner && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteTeam}
                  disabled={deleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? 'Eliminando...' : 'Elimina Team'}
                </Button>
              )}
              {!isOwner && (
                <Button
                  variant="destructive"
                  onClick={handleLeaveTeam}
                  disabled={leaving}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {leaving ? 'Leaving...' : 'Leave Team'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Invite Members (Owner only) */}
        {isOwner && memberCount < maxMembers && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Invite Members
              </CardTitle>
              <CardDescription>
                Search for users to invite to your team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteMemberForm teamId={team.id} onInviteSent={handleInviteSent} />
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {acceptedMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {member.profile?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{member.profile?.username}</p>
                    {member.profile?.epic_username && (
                      <p className="text-xs text-muted-foreground">
                        Epic: {member.profile.epic_username}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === 'owner' ? 'accent' : 'outline'}>
                    {member.role === 'owner' && <Crown className="w-3 h-3 mr-1" />}
                    {member.role}
                  </Badge>
                  {isOwner && member.user_id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={removingMember === member.user_id}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {/* Pending Invites */}
            {pendingMembers.length > 0 && (
              <>
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    Pending Invites
                  </h4>
                </div>
                {pendingMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-dashed border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="opacity-60">
                        <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {member.profile?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-muted-foreground">
                          {member.profile?.username}
                        </p>
                        <p className="text-xs text-muted-foreground">Pending...</p>
                      </div>
                    </div>
                    <Badge variant="outline">Invited</Badge>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
