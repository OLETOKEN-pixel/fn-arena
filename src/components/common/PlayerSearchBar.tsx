import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PlayerStatsModal } from '@/components/player/PlayerStatsModal';
import { cn } from '@/lib/utils';

interface SearchResult {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rank: number;
}

export function PlayerSearchBar() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setOpen(true);

      try {
        // Cast to any since RPC is newly created and types not yet regenerated
        const { data, error } = await (supabase.rpc as any)('search_players_public', {
          p_query: query.trim(),
          p_current_user_id: user?.id || null,
          p_limit: 10,
        });

        if (!error && data) {
          setResults(data as SearchResult[]);
        }
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, user?.id]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (userId: string) => {
    setSelectedUserId(userId);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <div ref={containerRef} className="relative hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search players..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim().length >= 1 && setOpen(true)}
            className="pl-9 pr-4 h-9 w-48 lg:w-64 bg-secondary/50 border-border/50 focus:border-primary/50 transition-all"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Dropdown Results */}
        {open && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            {loading ? (
              <div className="p-3 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No players found
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {results.map((player) => (
                  <button
                    key={player.user_id}
                    onClick={() => handleSelect(player.user_id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                      'hover:bg-secondary/50 transition-colors',
                      'focus:bg-secondary/50 focus:outline-none'
                    )}
                  >
                    <Avatar className="w-8 h-8 border border-border/50">
                      <AvatarImage src={player.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {player.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{player.username}</p>
                      <p className="text-xs text-muted-foreground">Rank #{player.rank}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Stats Modal */}
      <PlayerStatsModal
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
        userId={selectedUserId || ''}
      />
    </>
  );
}
