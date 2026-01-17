import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MatchCard } from '@/components/matches/MatchCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { REGIONS, PLATFORMS, GAME_MODES, type Match, type Region, type Platform, type GameMode } from '@/types';

export default function Matches() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, wallet, isProfileComplete, refreshWallet } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<GameMode | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'fee'>('newest');

  const fetchMatches = async () => {
    setLoading(true);

    let query = supabase
      .from('matches')
      .select(`
        *,
        creator:profiles!matches_creator_id_fkey(*),
        participants:match_participants(*)
      `)
      .eq('status', 'open'); // Only show OPEN matches

    // Apply filters
    if (regionFilter !== 'all') {
      query = query.eq('region', regionFilter);
    }
    if (platformFilter !== 'all') {
      query = query.eq('platform', platformFilter);
    }
    if (modeFilter !== 'all') {
      query = query.eq('mode', modeFilter);
    }

    // Apply sorting
    if (sortBy === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sortBy === 'fee') {
      query = query.order('entry_fee', { ascending: false });
    }

    const { data, error } = await query;

    if (!error && data) {
      let filtered = data as unknown as Match[];

      // Apply search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
          m.creator?.username?.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
        );
      }

      setMatches(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMatches();
  }, [regionFilter, platformFilter, modeFilter, sortBy, searchQuery]);

  const handleJoin = async (matchId: string) => {
    if (!user || !wallet) {
      navigate('/auth');
      return;
    }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile',
        description: 'Add your Epic Games Username before joining matches.',
        variant: 'destructive',
      });
      navigate('/profile');
      return;
    }

    if (wallet.balance < match.entry_fee) {
      toast({
        title: 'Insufficient balance',
        description: 'You need more Coins to join this match.',
        variant: 'destructive',
      });
      navigate('/buy');
      return;
    }

    setJoining(matchId);

    try {
      const { data, error } = await supabase.rpc('join_match_v2', {
        p_match_id: matchId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; status?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to join match');
      }

      toast({
        title: 'Joined!',
        description: 'You have joined the match. Get ready!',
      });

      await refreshWallet();
      navigate(`/matches/${matchId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to join match',
        variant: 'destructive',
      });
    } finally {
      setJoining(null);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Live Matches</h1>
            <p className="text-muted-foreground">Browse and join open FN matches</p>
          </div>
          {user && (
            <Button asChild className="glow-blue">
              <Link to="/matches/create">
                <Plus className="w-4 h-4 mr-2" />
                Create Match
              </Link>
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or match ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={regionFilter} onValueChange={(v) => setRegionFilter(v as Region | 'all')}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {REGIONS.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as Platform | 'all')}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {PLATFORMS.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as GameMode | 'all')}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              {GAME_MODES.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="fee">Highest Fee</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Matches Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-[350px] rounded-lg" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No open matches found</p>
            {user && (
              <Button asChild>
                <Link to="/matches/create">Create the First Match</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((match) => (
              <MatchCard 
                key={match.id} 
                match={match} 
                onJoin={handleJoin}
                isJoining={joining === match.id}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
