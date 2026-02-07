import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VoteCounts {
  [highlightId: string]: number;
}

export type VoteState = 'NOT_VOTED' | 'VOTED_THIS' | 'VOTED_OTHER';

/**
 * Format a Date as YYYY-MM-DD in LOCAL timezone (not UTC).
 * This is critical: toISOString() would shift the date in non-UTC timezones.
 */
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the Monday of the current ISO week (same logic as PostgreSQL date_trunc('week', now())).
 */
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days to subtract to reach Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return formatLocalDate(monday);
}

export function useHighlightVotes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userVotedHighlightId, setUserVotedHighlightId] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
  const [isVoting, setIsVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Lock to prevent concurrent vote operations
  const lockRef = useRef(false);
  // Cooldown flag: when true, realtime events won't trigger refetch
  const cooldownRef = useRef(false);

  const currentWeekStart = getCurrentWeekMonday();

  const fetchVotes = useCallback(async () => {
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

  const callVoteRpc = useCallback(async (
    highlightId: string,
    expectedAction: 'voted' | 'unvoted' | 'switched',
  ) => {
    if (lockRef.current) return;
    lockRef.current = true;
    cooldownRef.current = true;
    setIsVoting(true);

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

      // If server returned a different action, refetch to get ground truth
      if (result.action !== expectedAction) {
        console.warn(`Vote mismatch: expected=${expectedAction}, got=${result.action}`);
        cooldownRef.current = false;
        await fetchVotes();
      }
    } catch (error: any) {
      console.error('Vote error:', error);
      setUserVotedHighlightId(prevVotedId);
      setVoteCounts(prevCounts);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process vote',
        variant: 'destructive',
      });
    } finally {
      setIsVoting(false);
      setTimeout(() => {
        cooldownRef.current = false;
        lockRef.current = false;
        fetchVotes();
      }, 1500);
    }
  }, [userVotedHighlightId, voteCounts, fetchVotes, toast]);

  const castVote = useCallback(async (highlightId: string) => {
    if (!user) {
      toast({ title: 'Login required', description: 'Please login to vote', variant: 'destructive' });
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
