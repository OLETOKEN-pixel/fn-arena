import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VoteCounts {
  [highlightId: string]: number;
}

export type VoteState = 'NOT_VOTED' | 'VOTED_THIS' | 'VOTED_OTHER';

export function useHighlightVotes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userVotedHighlightId, setUserVotedHighlightId] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
  const [isVoting, setIsVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Lock to prevent ANY concurrent operations — stays locked until cooldown ends
  const lockRef = useRef(false);
  // Track if we're in a cooldown after a vote to ignore realtime refetches
  const cooldownRef = useRef(false);

  const currentWeekStart = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  })();

  const fetchVotes = useCallback(async () => {
    // Skip refetch if we're in post-vote cooldown (optimistic state is authoritative)
    if (cooldownRef.current) return;

    try {
      const { data: allVotes, error } = await supabase
        .from('highlight_votes')
        .select('highlight_id, user_id')
        .eq('week_start', currentWeekStart);

      if (error) throw error;

      const counts: VoteCounts = {};
      let userVote: string | null = null;

      allVotes?.forEach((vote) => {
        counts[vote.highlight_id] = (counts[vote.highlight_id] || 0) + 1;
        if (user && vote.user_id === user.id) {
          userVote = vote.highlight_id;
        }
      });

      setVoteCounts(counts);
      setUserVotedHighlightId(userVote);
    } catch (error) {
      console.error('Error fetching votes:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart, user]);

  useEffect(() => {
    fetchVotes();

    const channel = supabase
      .channel('highlight-votes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'highlight_votes' },
        () => {
          // Only refetch if NOT in cooldown
          if (!cooldownRef.current) {
            fetchVotes();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVotes]);

  const getVoteState = useCallback((highlightId: string): VoteState => {
    if (!user || !userVotedHighlightId) return 'NOT_VOTED';
    if (userVotedHighlightId === highlightId) return 'VOTED_THIS';
    return 'VOTED_OTHER';
  }, [user, userVotedHighlightId]);

  /**
   * Core vote action. Handles optimistic UI, RPC call, cooldown, and rollback.
   */
  const callVoteRpc = useCallback(async (
    highlightId: string,
    expectedAction: 'voted' | 'unvoted' | 'switched',
  ) => {
    // Hard lock — reject if already processing
    if (lockRef.current) return;
    lockRef.current = true;
    cooldownRef.current = true;
    setIsVoting(true);

    // Save pre-action state for rollback
    const prevVotedId = userVotedHighlightId;
    const prevCounts = { ...voteCounts };

    // Apply optimistic update immediately
    if (expectedAction === 'voted') {
      setUserVotedHighlightId(highlightId);
      setVoteCounts(prev => ({
        ...prev,
        [highlightId]: (prev[highlightId] || 0) + 1,
      }));
    } else if (expectedAction === 'unvoted') {
      setUserVotedHighlightId(null);
      setVoteCounts(prev => ({
        ...prev,
        [highlightId]: Math.max(0, (prev[highlightId] || 0) - 1),
      }));
    } else if (expectedAction === 'switched') {
      setUserVotedHighlightId(highlightId);
      setVoteCounts(prev => ({
        ...prev,
        ...(prevVotedId ? { [prevVotedId]: Math.max(0, (prev[prevVotedId] || 0) - 1) } : {}),
        [highlightId]: (prev[highlightId] || 0) + 1,
      }));
    }

    try {
      const { data, error } = await supabase.rpc('vote_highlight', {
        p_highlight_id: highlightId,
      });

      if (error) throw error;

      const result = data as { success: boolean; action?: string; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Vote failed');
      }

      // If server action doesn't match what we expected, the RPC did something
      // different (e.g. toggled when we expected insert). Refetch to get truth.
      if (result.action !== expectedAction) {
        console.warn(`Vote action mismatch: expected=${expectedAction}, got=${result.action}`);
        // Temporarily lift cooldown to allow refetch
        cooldownRef.current = false;
        await fetchVotes();
      }
    } catch (error: any) {
      console.error('Vote error:', error);
      // Rollback optimistic update
      setUserVotedHighlightId(prevVotedId);
      setVoteCounts(prevCounts);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process vote',
        variant: 'destructive',
      });
    } finally {
      setIsVoting(false);
      // Keep cooldown for 1.5s to let realtime events pass without overwriting state
      setTimeout(() => {
        cooldownRef.current = false;
        lockRef.current = false;
        // Do a final sync after cooldown to ensure consistency
        fetchVotes();
      }, 1500);
    }
  }, [userVotedHighlightId, voteCounts, fetchVotes, toast]);

  const castVote = useCallback(async (highlightId: string) => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to vote',
        variant: 'destructive',
      });
      return;
    }
    if (lockRef.current) return;
    await callVoteRpc(highlightId, 'voted');
  }, [user, callVoteRpc, toast]);

  const removeVote = useCallback(async () => {
    if (!user || !userVotedHighlightId || lockRef.current) return;
    await callVoteRpc(userVotedHighlightId, 'unvoted');
  }, [user, userVotedHighlightId, callVoteRpc]);

  const switchVote = useCallback(async (newHighlightId: string) => {
    if (!user || !userVotedHighlightId || lockRef.current) return;
    await callVoteRpc(newHighlightId, 'switched');
  }, [user, userVotedHighlightId, callVoteRpc]);

  // Top voted highlight
  const topVoted = Object.entries(voteCounts).reduce(
    (top, [id, count]) => (count > (top.count || 0) ? { id, count } : top),
    { id: null as string | null, count: 0 }
  );

  return {
    userVotedHighlightId,
    voteCounts,
    isVoting,
    loading,
    getVoteState,
    castVote,
    removeVote,
    switchVote,
    topVotedId: topVoted.id,
    topVotedCount: topVoted.count,
    currentWeekStart,
  };
}
