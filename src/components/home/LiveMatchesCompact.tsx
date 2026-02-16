import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowRight, Swords, Plus } from 'lucide-react';
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
        .limit(4);

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
    <section>
      {/* Section header — Figma style */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg lg:text-xl font-bold">Live Matches</h2>
          {matches.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-success/20 text-success rounded-full">
              {matches.length} open
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild className="text-sm group">
          <Link to="/matches" className="flex items-center gap-1">
            View All
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl skeleton-premium" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 rounded-2xl border border-border/50 bg-card/50">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Swords className="w-9 h-9 text-primary" />
            </div>
          </div>
          <h3 className="font-display text-xl font-semibold mb-2">No open matches</h3>
          <p className="text-muted-foreground mb-6 max-w-xs">
            Be the first to create a competitive match and start earning!
          </p>
          <Button asChild className="btn-premium group">
            <Link to="/matches/create">
              <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
              Create Match
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {matches.map((match, index) => (
            <div 
              key={match.id} 
              className={cn(
                "animate-card-enter",
                index === 0 && "stagger-1",
                index === 1 && "stagger-2",
                index === 2 && "stagger-3",
                index === 3 && "stagger-4"
              )}
            >
              <MatchCard match={match} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
