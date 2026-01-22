import { useState, useMemo } from 'react';
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
import { useOpenMatches, type MatchFilters } from '@/hooks/useMatches';
import { REGIONS, PLATFORMS, GAME_MODES, TEAM_SIZES, type Match, type Region, type Platform, type GameMode, type TeamSize } from '@/types';

export default function Matches() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, wallet, isProfileComplete, refreshWallet } = useAuth();
  const [joining, setJoining] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<GameMode | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<TeamSize | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'entry_fee_high'>('newest');

  // Build filters object for the hook
  const filters: MatchFilters = useMemo(() => ({
    region: regionFilter,
    platform: platformFilter,
    mode: modeFilter,
    size: sizeFilter === 'all' ? 'all' : sizeFilter,
    sortBy: sortBy === 'newest' ? 'newest' : 'entry_fee_high',
    searchQuery: searchQuery,
  }), [regionFilter, platformFilter, modeFilter, sizeFilter, sortBy, searchQuery]);

  // Use the realtime-enabled hook
  const { data: matchesData, isLoading: loading } = useOpenMatches(filters);
  const matches = (matchesData || []) as Match[];

  const getJoinErrorCopy = (reasonCode?: string, fallback?: string) => {
    switch (reasonCode) {
      case 'MATCH_FULL':
        return 'Match pieno.';
      case 'MATCH_NOT_JOINABLE':
        return 'Match non è più joinabile.';
      case 'INSUFFICIENT_BALANCE':
        return 'Fondi insufficienti.';
      case 'ALREADY_IN_ACTIVE_MATCH':
        return 'Hai già un match attivo.';
      case 'NOT_AUTHENTICATED':
        return 'Devi essere autenticato per joinare.';
      default:
        return fallback || 'Impossibile joinare il match.';
    }
  };

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

    // For team matches (2v2, 3v3, 4v4), redirect to match details with join flow
    if (match.team_size > 1) {
      navigate(`/matches/${matchId}?join=true`);
      return;
    }

    // For 1v1 matches, check balance and join directly
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
      const { data, error } = await supabase.rpc('join_match', { p_match_id: matchId });
      if (error) throw error;

      const result = data as
        | { success: boolean; reason_code?: string; message?: string; error?: string }
        | null;

      if (!result?.success) {
        const msg = getJoinErrorCopy(result?.reason_code, result?.message || result?.error);
        toast({
          title: 'Impossibile joinare',
          description: msg,
          variant: 'destructive',
        });
        return;
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

          <Select value={String(sizeFilter)} onValueChange={(v) => setSizeFilter(v === 'all' ? 'all' : parseInt(v) as TeamSize)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sizes</SelectItem>
              {TEAM_SIZES.map(ts => (
                <SelectItem key={ts.value} value={String(ts.value)}>{ts.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="entry_fee_high">Highest Fee</SelectItem>
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
