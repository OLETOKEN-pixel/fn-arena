import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Swords, Receipt, X, Command } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/custom-badge';

interface SearchResults {
  users: Array<{
    id: string;
    user_id: string;
    username: string;
    email: string;
    avatar_url: string | null;
    is_banned: boolean;
  }>;
  matches: Array<{
    id: string;
    mode: string;
    region: string;
    status: string;
    entry_fee: number;
    team_size: number;
    creator_username: string;
    created_at: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    match_id: string | null;
    user_id: string;
    created_at: string;
  }>;
}

export function GlobalSearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_global_search', { p_query: query });
      
      if (!error && data) {
        setResults(data as unknown as SearchResults);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleResultClick = (type: 'user' | 'match' | 'transaction', id: string) => {
    setIsOpen(false);
    setQuery('');
    
    if (type === 'user') {
      navigate(`/admin/users/${id}`);
    } else if (type === 'match') {
      navigate(`/admin/matches/${id}`);
    }
    // Transactions could navigate to match detail or stay on admin
  };

  const totalResults = results 
    ? results.users.length + results.matches.length + results.transactions.length 
    : 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Cerca utenti, match, transazioni..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-20 bg-secondary border-border"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-background rounded border border-border font-mono">
            <Command className="w-3 h-3 inline" />
          </kbd>
          <kbd className="px-1.5 py-0.5 bg-background rounded border border-border font-mono">K</kbd>
        </div>
      </div>

      {/* Dropdown Results */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : totalResults === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              Nessun risultato per "{query}"
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Users Section */}
              {results?.users && results.users.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                    Utenti
                  </div>
                  {results.users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleResultClick('user', user.user_id)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.avatar_url ?? undefined} />
                        <AvatarFallback>{user.username?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{user.username}</span>
                          {user.is_banned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">{user.email}</span>
                      </div>
                      <User className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {/* Matches Section */}
              {results?.matches && results.matches.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                    Match
                  </div>
                  {results.matches.map((match) => (
                    <button
                      key={match.id}
                      onClick={() => handleResultClick('match', match.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-md bg-accent/20 flex items-center justify-center">
                        <Swords className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{match.team_size}v{match.team_size} {match.mode}</span>
                          <Badge variant={match.status === 'disputed' ? 'destructive' : 'outline'} className="text-xs">
                            {match.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {match.region} • {match.entry_fee} Coins • by {match.creator_username}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Transactions Section */}
              {results?.transactions && results.transactions.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                    Transazioni
                  </div>
                  {results.transactions.map((tx) => (
                    <button
                      key={tx.id}
                      onClick={() => tx.match_id && handleResultClick('match', tx.match_id)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-md bg-success/20 flex items-center justify-center">
                        <Receipt className="w-4 h-4 text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{tx.type}</span>
                          <span className={tx.amount > 0 ? 'text-success' : 'text-destructive'}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">{tx.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
