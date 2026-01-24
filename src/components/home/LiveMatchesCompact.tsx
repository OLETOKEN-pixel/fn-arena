import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowRight, Swords } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchCard } from '@/components/matches/MatchCard';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/types';

export function LiveMatchesCompact() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          creator:profiles!matches_creator_id_fkey(*),
          participants:match_participants(*)
        `)
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(3);

      if (!error && data) {
        setMatches(data as unknown as Match[]);
      }
      setLoading(false);
    };

    fetchMatches();

    const channel = supabase
      .channel('matches_home_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        () => {
          fetchMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="flex-1 min-h-0 flex flex-col bg-card border-border overflow-hidden">
      <CardHeader className="py-3 px-4 flex-shrink-0">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Live Matches
          </span>
          <Button variant="ghost" size="sm" asChild className="text-xs">
            <Link to="/matches" className="flex items-center gap-1">
              View All
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Swords className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground mb-4">No open matches right now</p>
            <Button asChild className="glow-blue">
              <Link to="/matches/create">Create the First Match</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
