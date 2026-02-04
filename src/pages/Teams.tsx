import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Plus, Users, Crown, ChevronRight, Sparkles } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Team, TeamMember, Profile } from '@/types';

interface TeamWithMembers extends Team {
  members: (TeamMember & { profile: Profile })[];
}

export default function Teams() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate(`/auth?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (user) fetchTeams();
  }, [user, authLoading, navigate, location.pathname]);

  const fetchTeams = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const { data: memberships, error: memberError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (memberError) throw memberError;
      
      if (!memberships || memberships.length === 0) {
        setTeams([]);
        setLoading(false);
        return;
      }

      const teamIds = memberships.map(m => m.team_id);
      
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .in('id', teamIds);

      if (teamsError) throw teamsError;

      const teamsWithMembers = await Promise.all(
        (teamsData || []).map(async (team) => {
          const { data: membersData, error: membersError } = await supabase.rpc('get_team_members', {
            p_team_id: team.id,
          });

          if (membersError) {
            console.error('Error fetching members for team', team.id, membersError);
            return { ...team, members: [] };
          }

          const membersResult = membersData as
            | { success: boolean; members?: Array<any>; error?: string }
            | null;

          const membersRaw = (membersResult?.success ? membersResult.members : []) ?? [];
          const members = membersRaw.map((m: any) => ({
            id: m.id ?? `${team.id}-${m.user_id}`,
            team_id: team.id,
            user_id: m.user_id,
            role: m.role,
            status: m.status,
            profile: {
              user_id: m.user_id,
              username: m.username,
              avatar_url: m.avatar_url,
              epic_username: m.epic_username,
            } as unknown as Profile,
          }));

          return { ...team, members } as TeamWithMembers;
        })
      );

      setTeams(teamsWithMembers);
    } catch (error) {
      console.error('Error fetching teams:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      toast({
        title: 'Errore',
        description: 'Inserisci un nome per il team',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_team', { 
        p_name: teamName.trim() 
      });

      if (error) throw error;

      const result = data as { success: boolean; team_id?: string; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Errore nella creazione del team');
      }

      toast({
        title: 'Team creato!',
        description: `${teamName} è stato creato. Ora invita i tuoi compagni!`,
      });
      
      setCreateOpen(false);
      setTeamName('');
      fetchTeams();
      
      if (result.team_id) {
        navigate(`/teams/${result.team_id}`);
      }
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Errore nella creazione del team',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const getAcceptedMemberCount = (team: TeamWithMembers) => {
    return team.members?.filter(m => m.status === 'accepted').length || 0;
  };

  const getEligibilityBadge = (count: number) => {
    if (count >= 4) return '4v4';
    if (count >= 3) return '3v3';
    if (count >= 2) return '2v2';
    return null;
  };

  if (authLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl skeleton-premium" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showChat={false}>
      {/* Container handled by MainLayout for 1920×1080 balance */}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-3">
              <div className="relative">
                <Users className="w-7 h-7 text-primary" />
                <div className="absolute inset-0 w-7 h-7 bg-primary/20 blur-lg rounded-full" />
              </div>
              I Miei Team
            </h1>
            <p className="text-sm text-muted-foreground">Gestisci i tuoi team per i match 2v2, 3v3 e 4v4</p>
          </div>
          
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 glow-blue btn-premium">
                <Plus className="w-4 h-4" /> Crea Team
              </Button>
            </DialogTrigger>
            <DialogContent className="card-glass">
              <DialogHeader>
                <DialogTitle>Crea un Nuovo Team</DialogTitle>
                <DialogDescription>
                  Inserisci un nome per il tuo team. Potrai invitare membri dopo la creazione.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Nome Team</Label>
                  <Input
                    id="teamName"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Es: Pro Gamers, Team Alpha..."
                    maxLength={30}
                    autoFocus
                    className="bg-background/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Un tag verrà generato automaticamente
                  </p>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleCreateTeam} disabled={creating || !teamName.trim()} className="glow-blue">
                  {creating ? 'Creazione...' : 'Crea Team'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Teams Grid or Empty State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl skeleton-premium" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <Card className="border-dashed border-2 card-glass">
            <CardContent className="flex flex-col items-center justify-center py-16 px-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-6 animate-pulse-soft">
                <Users className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Nessun Team</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-sm">
                Crea il tuo primo team per partecipare ai match 2v2, 3v3 o 4v4 con i tuoi amici
              </p>
              <Button size="lg" onClick={() => setCreateOpen(true)} className="gap-2 glow-blue btn-premium">
                <Plus className="w-5 h-5" /> Crea il Tuo Team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {teams.map((team, index) => {
              const memberCount = getAcceptedMemberCount(team);
              const eligibility = getEligibilityBadge(memberCount);
              const isOwner = team.owner_id === user?.id;

              return (
                <Link key={team.id} to={`/teams/${team.id}`}>
                  <Card className={cn(
                    "group bg-gradient-to-br from-card to-card/50 border-border",
                    "hover:border-primary/50 transition-all duration-300 cursor-pointer h-full",
                    "card-hover animate-card-enter",
                    `stagger-${Math.min(index + 1, 6)}`
                  )}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-4">
                        {/* Team Icon */}
                        <div className={cn(
                          "w-14 h-14 rounded-xl flex items-center justify-center border shrink-0",
                          "bg-gradient-to-br from-primary/20 to-accent/10 border-primary/20",
                          "group-hover:scale-105 group-hover:border-primary/40 transition-all"
                        )}>
                          <span className="text-lg font-bold text-primary">
                            {team.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate group-hover:text-primary transition-colors">
                            {team.name}
                          </CardTitle>
                          <CardDescription>
                            {memberCount} {memberCount === 1 ? 'membro' : 'membri'}
                          </CardDescription>
                        </div>
                        
                        {/* Badges */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {isOwner && (
                            <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xs px-2 glow-gold-soft">
                              <Crown className="w-3 h-3 mr-1" /> Owner
                            </Badge>
                          )}
                          {eligibility && (
                            <Badge variant="outline" className="text-xs border-primary/30">
                              {eligibility}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        {/* Member Avatars */}
                        <div className="flex items-center -space-x-2">
                          {team.members?.filter(m => m.status === 'accepted').slice(0, 4).map((member) => (
                            <Avatar 
                              key={member.user_id} 
                              className="w-9 h-9 border-2 border-background ring-1 ring-border/50"
                            >
                              <AvatarImage 
                                src={member.profile?.avatar_url || undefined}
                                className="object-cover" 
                              />
                              <AvatarFallback className="bg-secondary text-xs">
                                {member.profile?.username?.[0]?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {memberCount > 4 && (
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
                              +{memberCount - 4}
                            </div>
                          )}
                        </div>
                        
                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
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
