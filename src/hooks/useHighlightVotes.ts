import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface VoteCounts {
  [highlightId: string]: number;
}

export function useHighlightVotes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userVotedHighlightId, setUserVotedHighlightId] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
  const [isVoting, setIsVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentWeekStart = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  })();

  const fetchVotes = useCallback(async () => {
    try {
      // Fetch all votes for current week
      const { data: allVotes, error: votesError } = await supabase
        .from('highlight_votes')
        .select('highlight_id, user_id')
        .eq('week_start', currentWeekStart);

      if (votesError) throw votesError;

      // Count votes per highlight
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

    // Subscribe to realtime changes
    const channel = supabase
      .channel('highlight-votes-changes')
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

  const vote = useCallback(async (highlightId: string) => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to vote',
        variant: 'destructive',
      });
      return;
    }

    setIsVoting(true);
    try {
      const { data, error } = await supabase.rpc('vote_highlight', {
        p_highlight_id: highlightId,
      });

      if (error) throw error;

      const result = data as { success: boolean; action?: string; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Vote failed');
      }

      // Optimistic update
      if (result.action === 'voted') {
        setUserVotedHighlightId(highlightId);
        setVoteCounts(prev => ({
          ...prev,
          [highlightId]: (prev[highlightId] || 0) + 1,
        }));
      } else if (result.action === 'unvoted') {
        setUserVotedHighlightId(null);
        setVoteCounts(prev => ({
          ...prev,
          [highlightId]: Math.max(0, (prev[highlightId] || 0) - 1),
        }));
      } else if (result.action === 'switched') {
        const oldId = userVotedHighlightId;
        setUserVotedHighlightId(highlightId);
        setVoteCounts(prev => ({
          ...prev,
          ...(oldId ? { [oldId]: Math.max(0, (prev[oldId] || 0) - 1) } : {}),
          [highlightId]: (prev[highlightId] || 0) + 1,
        }));
      }
    } catch (error: any) {
      console.error('Vote error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to vote',
        variant: 'destructive',
      });
      // Refetch to restore correct state
      fetchVotes();
    } finally {
      setIsVoting(false);
    }
  }, [user, userVotedHighlightId, fetchVotes, toast]);

  // Get top voted highlight of the week
  const topVotedHighlightId = Object.entries(voteCounts).reduce(
    (top, [id, count]) => (count > (top.count || 0) ? { id, count } : top),
    { id: null as string | null, count: 0 }
  );

  return {
    userVotedHighlightId,
    voteCounts,
    vote,
    isVoting,
    loading,
    topVotedId: topVotedHighlightId.id,
    topVotedCount: topVotedHighlightId.count,
    currentWeekStart,
  };
}
