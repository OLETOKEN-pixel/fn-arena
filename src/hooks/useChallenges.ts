import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  metric_type: string;
  target_value: number;
  reward_xp: number;
  reward_coin: number;
  progress_value: number;
  is_completed: boolean;
  is_claimed: boolean;
  period_key: string;
}

export interface ClaimResult {
  success: boolean;
  xp?: number;
  coin?: number;
  coin_capped?: boolean;
  already_claimed?: boolean;
  error?: string;
}

export function useChallenges() {
  const { user, refreshWallet } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isOnChallengesPage = location.pathname === '/challenges';

  // Fetch challenges with progress
  const {
    data: challenges = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['challenges', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase.rpc('get_user_challenges');
      
      if (error) {
        console.error('Error fetching challenges:', error);
        return [];
      }
      
      return (data as unknown as Challenge[]) || [];
    },
    enabled: !!user,
    staleTime: 10000, // 10 seconds
  });

  // Fetch user XP
  const { data: userXp = 0 } = useQuery({
    queryKey: ['user-xp', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      
      const { data, error } = await supabase.rpc('get_user_xp');
      
      if (error) {
        console.error('Error fetching XP:', error);
        return 0;
      }
      
      return (data as number) || 0;
    },
    enabled: !!user,
  });

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: async ({ challengeId, periodKey }: { challengeId: string; periodKey: string }) => {
      const { data, error } = await supabase.rpc('claim_challenge_reward', {
        p_challenge_id: challengeId,
        p_period_key: periodKey,
      });
      
      if (error) throw error;
      return data as unknown as ClaimResult;
    },
    onSuccess: (result, { challengeId }) => {
      if (result.success) {
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
        queryClient.invalidateQueries({ queryKey: ['user-xp'] });
        
        // Refresh wallet for coin rewards
        if (result.coin && result.coin > 0) {
          refreshWallet();
        }
        
        // Show success toast
        if (!result.already_claimed) {
          const rewardParts: string[] = [];
          if (result.xp && result.xp > 0) rewardParts.push(`+${result.xp} XP`);
          if (result.coin && result.coin > 0) rewardParts.push(`+${result.coin} Coin`);
          
          if (result.coin_capped) {
            toast.success('Challenge claimed! Weekly coin limit reached.', {
              description: rewardParts.join(' • '),
            });
          } else {
            toast.success('Challenge claimed!', {
              description: rewardParts.join(' • '),
            });
          }
        }
      }
    },
    onError: (error) => {
      console.error('Claim error:', error);
      toast.error('Failed to claim reward');
    },
  });

  // Realtime subscription for progress updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('challenges-progress-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_challenge_progress',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['challenges', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_xp',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['user-xp', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Polling fallback ONLY on /challenges page
  useEffect(() => {
    if (!user || !isOnChallengesPage) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['challenges', user.id] });
    }, 25000); // 25 seconds

    return () => clearInterval(interval);
  }, [user, isOnChallengesPage, queryClient]);

  // Helper functions
  const dailyChallenges = challenges.filter((c) => c.type === 'daily');
  const weeklyChallenges = challenges.filter((c) => c.type === 'weekly');

  const claimChallenge = useCallback(
    (challengeId: string, periodKey: string) => {
      return claimMutation.mutateAsync({ challengeId, periodKey });
    },
    [claimMutation]
  );

  // Calculate reset times
  const getResetTimes = useCallback(() => {
    const now = new Date();
    const utcNow = new Date(now.toISOString());
    
    // Daily reset: next midnight UTC
    const dailyReset = new Date(utcNow);
    dailyReset.setUTCHours(24, 0, 0, 0);
    
    // Weekly reset: next Monday 00:00 UTC
    const weeklyReset = new Date(utcNow);
    const dayOfWeek = weeklyReset.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    weeklyReset.setUTCDate(weeklyReset.getUTCDate() + daysUntilMonday);
    weeklyReset.setUTCHours(0, 0, 0, 0);
    
    return {
      dailyReset,
      weeklyReset,
      dailyMs: dailyReset.getTime() - utcNow.getTime(),
      weeklyMs: weeklyReset.getTime() - utcNow.getTime(),
    };
  }, []);

  return {
    challenges,
    dailyChallenges,
    weeklyChallenges,
    userXp,
    isLoading,
    claimChallenge,
    isClaiming: claimMutation.isPending,
    refetch,
    getResetTimes,
  };
}
