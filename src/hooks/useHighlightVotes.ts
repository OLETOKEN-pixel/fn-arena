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

  // Ref to prevent concurrent vote operations
  const votingRef = useRef(false);

  const currentWeekStart = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  })();

  const fetchVotes = useCallback(async () => {
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
        () => fetchVotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVotes]);

  // Helper to get vote state for a specific highlight
  const getVoteState = useCallback((highlightId: string): VoteState => {
    if (!user || !userVotedHighlightId) return 'NOT_VOTED';
    if (userVotedHighlightId === highlightId) return 'VOTED_THIS';
    return 'VOTED_OTHER';
  }, [user, userVotedHighlightId]);

  // Internal vote call with optimistic UI
  const callVoteRpc = useCallback(async (
    highlightId: string,
    expectedAction: 'voted' | 'unvoted' | 'switched',
  ) => {
    if (votingRef.current) return;
    votingRef.current = true;
    setIsVoting(true);

    // Save state for rollback
    const prevVotedId = userVotedHighlightId;
    const prevCounts = { ...voteCounts };

    // Optimistic update
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

      // If server returned a different action than expected, refetch to correct state
      if (result.action !== expectedAction) {
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
      votingRef.current = false;
    }
  }, [userVotedHighlightId, voteCounts, fetchVotes, toast]);

  // Cast a new vote (user has NOT voted yet this week)
  const castVote = useCallback(async (highlightId: string) => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to vote',
        variant: 'destructive',
      });
      return;
    }
    await callVoteRpc(highlightId, 'voted');
  }, [user, callVoteRpc, toast]);

  // Remove current vote
  const removeVote = useCallback(async () => {
    if (!user || !userVotedHighlightId) return;
    await callVoteRpc(userVotedHighlightId, 'unvoted');
  }, [user, userVotedHighlightId, callVoteRpc]);

  // Switch vote to a new highlight (called AFTER user confirms in modal)
  const switchVote = useCallback(async (newHighlightId: string) => {
    if (!user || !userVotedHighlightId) return;
    await callVoteRpc(newHighlightId, 'switched');
  }, [user, userVotedHighlightId, callVoteRpc]);

  // Get top voted highlight of the week
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
