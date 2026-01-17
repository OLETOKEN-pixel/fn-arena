import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Swords, Coins } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { REGIONS, PLATFORMS, GAME_MODES, FIRST_TO_OPTIONS, ENTRY_FEE_PRESETS, type Region, type Platform, type GameMode } from '@/types';

export default function CreateMatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, wallet, isProfileComplete, refreshWallet } = useAuth();

  const [isPrivate, setIsPrivate] = useState(false);
  const [entryFee, setEntryFee] = useState<number>(1);
  const [customFee, setCustomFee] = useState('');
  const [region, setRegion] = useState<Region>('EU');
  const [platform, setPlatform] = useState<Platform>('All');
  const [mode, setMode] = useState<GameMode>('1v1');
  const [teamSize, setTeamSize] = useState(1);
  const [firstTo, setFirstTo] = useState(3);
  const [creating, setCreating] = useState(false);

  const actualFee = customFee ? parseFloat(customFee) : entryFee;
  const canAfford = wallet && wallet.balance >= actualFee;

  // Redirect if not logged in
  if (!user) {
    return (
      <MainLayout showChat={false}>
        <div className="max-w-2xl mx-auto text-center py-12">
          <Swords className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="text-muted-foreground mb-6">
            You need to sign in to create a match.
          </p>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const handleCreate = async () => {
    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile',
        description: 'Add your Epic Games Username before creating matches.',
        variant: 'destructive',
      });
      return;
    }

    if (!canAfford) {
      toast({
        title: 'Insufficient balance',
        description: 'You need more Coins to create this match.',
        variant: 'destructive',
      });
      navigate('/buy');
      return;
    }

    setCreating(true);

    try {
      // Create match
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2); // 2 hours expiry

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          creator_id: user.id,
          game: 'FN',
          region,
          platform,
          mode,
          team_size: teamSize,
          first_to: firstTo,
          entry_fee: actualFee,
          is_private: isPrivate,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (matchError) throw matchError;

      // Lock coins using secure server-side function (prevents race conditions & manipulation)
      const { data: lockResult, error: lockError } = await supabase.rpc('lock_funds_for_match', {
        p_match_id: match.id,
        p_amount: actualFee,
      });

      if (lockError) throw lockError;
      const lockData = lockResult as { success: boolean; error?: string } | null;
      if (lockData && !lockData.success) {
        throw new Error(lockData.error || 'Failed to lock funds');
      }

      // Add creator as participant
      await supabase.from('match_participants').insert({
        match_id: match.id,
        user_id: user.id,
      });

      await refreshWallet();

      toast({
        title: 'Match created!',
        description: 'Your match is now live.',
      });

      navigate(`/matches/${match.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create match. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <MainLayout showChat={false}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back button */}
        <Link
          to="/matches"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Matches
        </Link>

        {/* Epic Username Warning */}
        {!isProfileComplete && <EpicUsernameWarning />}

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="w-6 h-6 text-primary" />
              Create Match
            </CardTitle>
            <CardDescription>
              Set up a new FN match and find opponents
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Entry Fee */}
            <div className="space-y-3">
              <Label>Entry Fee (Coins)</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {ENTRY_FEE_PRESETS.map((fee) => (
                  <Button
                    key={fee}
                    type="button"
                    variant={entryFee === fee && !customFee ? 'default' : 'outline'}
                    onClick={() => { setEntryFee(fee); setCustomFee(''); }}
                  >
                    {fee}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Custom amount"
                  value={customFee}
                  onChange={(e) => setCustomFee(e.target.value)}
                  min={0.5}
                  step={0.5}
                />
              </div>
              {!canAfford && (
                <p className="text-sm text-destructive">
                  Insufficient balance. You need {actualFee} Coins.{' '}
                  <Link to="/buy" className="underline">Buy Coins</Link>
                </p>
              )}
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label>Game Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as GameMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAME_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team Size */}
            <div className="space-y-2">
              <Label>Team Size</Label>
              <Select value={String(teamSize)} onValueChange={(v) => setTeamSize(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1v1</SelectItem>
                  <SelectItem value="2">2v2</SelectItem>
                  <SelectItem value="3">3v3</SelectItem>
                  <SelectItem value="4">4v4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* First to */}
            <div className="space-y-2">
              <Label>First to (wins)</Label>
              <Select value={String(firstTo)} onValueChange={(v) => setFirstTo(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIRST_TO_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>First to {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Private Match */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Private Match</Label>
                <p className="text-sm text-muted-foreground">Only people with the link can join</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-secondary space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry Fee:</span>
                <CoinDisplay amount={actualFee} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prize Pool:</span>
                <CoinDisplay amount={actualFee * teamSize * 2 * 0.95} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Fee (5%):</span>
                <CoinDisplay amount={actualFee * teamSize * 2 * 0.05} />
              </div>
            </div>

            <Button
              size="lg"
              className="w-full glow-blue"
              onClick={handleCreate}
              disabled={creating || !canAfford || !isProfileComplete}
            >
              {creating ? 'Creating...' : 'Create Match'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
