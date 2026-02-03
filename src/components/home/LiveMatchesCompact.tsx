import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowRight, Swords } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchCard } from '@/components/matches/MatchCard';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
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
    <Card className="flex-1 min-h-0 flex flex-col overflow-hidden card-glass">
      <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border/50">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <div className="relative">
              <Zap className="w-5 h-5 text-primary" />
              <div className="absolute inset-0 w-5 h-5 bg-primary/30 blur-md rounded-full" />
            </div>
            <span>Live Matches</span>
            {matches.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-success/20 text-success rounded-full animate-pulse">
                {matches.length} open
              </span>
            )}
          </span>
          <Button variant="ghost" size="sm" asChild className="text-xs group">
            <Link to="/matches" className="flex items-center gap-1">
              View All
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl skeleton-premium" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-4 animate-pulse-soft">
              <Swords className="w-9 h-9 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">No open matches</h3>
            <p className="text-muted-foreground text-sm mb-4">Be the first to create one!</p>
            <Button asChild className="glow-blue">
              <Link to="/matches/create">Create Match</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {matches.map((match, index) => (
              <div 
                key={match.id} 
                className={cn(
                  "animate-card-enter",
                  index === 0 && "stagger-1",
                  index === 1 && "stagger-2",
                  index === 2 && "stagger-3"
                )}
              >
                <MatchCard match={match} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
