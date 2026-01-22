import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Team, TeamMember, Profile, TeamMemberWithBalance } from '@/types';

interface TeamWithMembersAndBalance extends Team {
  members: (TeamMember & { profile: Profile })[];
  memberBalances?: TeamMemberWithBalance[];
  acceptedMemberCount: number;
}

export function useEligibleTeams(teamSize: number, entryFee?: number) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamWithMembersAndBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch teams where user is an accepted member
    const { data: memberData } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    const teamIds = memberData?.map(m => m.team_id) ?? [];

    if (teamIds.length === 0) {
      setTeams([]);
      setLoading(false);
      return;
    }

    // Fetch teams (members are hydrated via RPC to avoid profiles_public visibility issues)
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .in('id', teamIds);

    if (!teamsData) {
      setTeams([]);
      setLoading(false);
      return;
    }

    // Hydrate members via RPC and compute accepted member count
    const processedTeams: TeamWithMembersAndBalance[] = [];

    for (const team of teamsData as any[]) {
      const { data: membersData } = await supabase.rpc('get_team_members', {
        p_team_id: team.id,
      });

      const membersResult = membersData as
        | { success: boolean; members?: Array<any>; error?: string }
        | null;
      const membersRaw = (membersResult?.success ? membersResult.members : []) ?? [];

      const acceptedMembers = membersRaw
        .filter((m: any) => m.status === 'accepted')
        .map((m: any) => ({
          id: m.id ?? `${m.team_id}-${m.user_id}-${m.role}-${m.status}`,
          team_id: m.team_id,
          user_id: m.user_id,
          role: m.role,
          status: m.status,
          created_at: m.created_at,
          profile: {
            user_id: m.user_id,
            username: m.username,
            avatar_url: m.avatar_url,
            epic_username: m.epic_username,
          } as unknown as Profile,
        })) as (TeamMember & { profile: Profile })[];

      processedTeams.push({
        ...team,
        members: acceptedMembers,
        acceptedMemberCount: acceptedMembers.length,
      });
    }

    // If entryFee is provided, fetch balance info for eligible teams
    if (entryFee !== undefined && teamSize > 0) {
      const eligibleTeams = processedTeams.filter(t => t.acceptedMemberCount === teamSize);
      
      for (const team of eligibleTeams) {
        const { data: balanceData } = await supabase.rpc('get_team_members_with_balance', {
          p_team_id: team.id,
        });

        if (balanceData) {
          team.memberBalances = (balanceData as TeamMemberWithBalance[]).map(m => ({
            ...m,
            has_sufficient_balance: m.balance >= entryFee,
          }));
        }
      }
    }

    setTeams(processedTeams);
    setLoading(false);
  }, [user, teamSize, entryFee]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Filter to only teams with exact member count matching teamSize
  const eligibleTeams = teams.filter(t => t.acceptedMemberCount === teamSize);
  
  // Check if all members have sufficient balance
  const teamsWithSufficientBalance = eligibleTeams.filter(t => {
    if (!entryFee || !t.memberBalances) return true;
    return t.memberBalances.every(m => m.has_sufficient_balance);
  });

  return {
    allTeams: teams,
    eligibleTeams,
    teamsWithSufficientBalance,
    loading,
    refresh: fetchTeams,
  };
}
