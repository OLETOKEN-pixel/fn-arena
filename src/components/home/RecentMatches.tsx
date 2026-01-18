import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchCard } from '@/components/matches/MatchCard';
import { supabase } from '@/integrations/supabase/client';
import type { Match } from '@/types';

export function RecentMatches() {
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
        .gt('expires_at', new Date().toISOString()) // Only non-expired matches
        .order('created_at', { ascending: false })
        .limit(6);

      if (!error && data) {
        setMatches(data as unknown as Match[]);
      }
      setLoading(false);
    };

    fetchMatches();

    // Subscribe to new matches
    const channel = supabase
      .channel('matches_realtime')
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
    <section className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Zap className="w-6 h-6 text-primary" />
          Live Matches
        </h2>
        <Button variant="ghost" asChild>
          <Link to="/matches" className="flex items-center gap-1">
            View All
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : matches.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No open matches right now</p>
            <Button asChild>
              <Link to="/matches/create">Create the First Match</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </section>
  );
}
