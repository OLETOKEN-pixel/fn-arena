import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Swords, AlertCircle, Users } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { EpicUsernameWarning } from '@/components/common/EpicUsernameWarning';
import { TeamSelector } from '@/components/teams/TeamSelector';
import { PaymentModeSelector } from '@/components/teams/PaymentModeSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useEligibleTeams } from '@/hooks/useEligibleTeams';
import { supabase } from '@/integrations/supabase/client';
import { REGIONS, PLATFORMS, GAME_MODES, FIRST_TO_OPTIONS, ENTRY_FEE_PRESETS, TEAM_SIZES, type Region, type Platform, type GameMode, type PaymentMode, type Team, type TeamMember, type Profile, type TeamMemberWithBalance } from '@/types';

interface SelectedTeam extends Team {
  members: (TeamMember & { profile: Profile })[];
  memberBalances?: TeamMemberWithBalance[];
  acceptedMemberCount: number;
}

export default function CreateMatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, wallet, isProfileComplete, refreshWallet } = useAuth();

  const [isPrivate, setIsPrivate] = useState(false);
  const [entryFee, setEntryFee] = useState<number>(1);
  const [customFee, setCustomFee] = useState('');
  const [region, setRegion] = useState<Region>('EU');
  const [platform, setPlatform] = useState<Platform>('All');
  const [mode, setMode] = useState<GameMode>('Box Fight');
  const [teamSize, setTeamSize] = useState(1);
  const [firstTo, setFirstTo] = useState(3);
  const [creating, setCreating] = useState(false);
  
  // Team match state
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cover');

  const actualFee = customFee ? parseFloat(customFee) : entryFee;
  const isTeamMatch = teamSize > 1;
  const totalCost = isTeamMatch ? actualFee * teamSize : actualFee;
  
  // For 1v1, check user balance; for team with cover, check if user can afford total
  const canAffordSolo = wallet && wallet.balance >= actualFee;
  const canAffordCover = wallet && wallet.balance >= totalCost;
  
  // For split mode, check team member balances
  const canAffordSplit = selectedTeam?.memberBalances?.every(m => m.balance >= actualFee) ?? false;
  
  const canAfford = isTeamMatch 
    ? (paymentMode === 'cover' ? canAffordCover : canAffordSplit)
    : canAffordSolo;
    
  const canCreate = isTeamMatch ? (selectedTeam !== null && canAfford) : canAfford;

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

    if (!canCreate) {
      toast({
        title: 'Cannot create match',
        description: isTeamMatch && !selectedTeam 
          ? 'Please select a team first.'
          : 'Insufficient balance.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);

    try {
      if (isTeamMatch && selectedTeam) {
        // Create team match using RPC
        const { data, error } = await supabase.rpc('create_team_match', {
          p_team_id: selectedTeam.id,
          p_entry_fee: actualFee,
          p_region: region,
          p_platform: platform,
          p_mode: mode,
          p_team_size: teamSize,
          p_first_to: firstTo,
          p_payment_mode: paymentMode,
          p_is_private: isPrivate,
        });

        if (error) throw error;

        const result = data as { success: boolean; error?: string; match_id?: string } | null;
        if (result && !result.success) {
          throw new Error(result.error);
        }

        await refreshWallet();

        toast({
          title: 'Match created!',
          description: 'Your team match is now live.',
        });

        navigate(`/matches/${result?.match_id}`);
      } else {
        // Create 1v1 match using secure RPC with active match validation
        const { data, error } = await supabase.rpc('create_match_1v1', {
          p_region: region,
          p_platform: platform,
          p_mode: mode,
          p_first_to: firstTo,
          p_entry_fee: actualFee,
          p_is_private: isPrivate,
        });

        if (error) throw error;

        const result = data as { success: boolean; error?: string; match_id?: string } | null;
        if (result && !result.success) {
          throw new Error(result.error);
        }

        await refreshWallet();

        toast({
          title: 'Match created!',
          description: 'Your match is now live.',
        });

        navigate(`/matches/${result?.match_id}`);
      }
    } catch (error: unknown) {
      console.error('Match creation error:', error);
      
      let errorMessage = 'Failed to create match. Please try again.';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message);
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  // Reset team selection when team size changes
  const handleTeamSizeChange = (size: number) => {
    setTeamSize(size);
    setSelectedTeam(null);
    if (size === 1) {
      setPaymentMode('cover');
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
              <Label>Entry Fee (Coins per player)</Label>
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
            </div>

            {/* Team Size */}
            <div className="space-y-2">
              <Label>Match Size</Label>
              <Select value={String(teamSize)} onValueChange={(v) => handleTeamSizeChange(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZES.map((ts) => (
                    <SelectItem key={ts.value} value={String(ts.value)}>{ts.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team Selection (for team matches) */}
            {isTeamMatch && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Select Your Team
                </Label>
                <TeamSelector
                  teamSize={teamSize}
                  entryFee={actualFee}
                  selectedTeamId={selectedTeam?.id ?? null}
                  onSelectTeam={(team) => setSelectedTeam(team as SelectedTeam | null)}
                  paymentMode={paymentMode}
                />
              </div>
            )}

            {/* Payment Mode (for team matches with selected team) */}
            {isTeamMatch && selectedTeam && (
              <div className="space-y-3">
                <Label>Payment Mode</Label>
                <PaymentModeSelector
                  paymentMode={paymentMode}
                  onChangePaymentMode={setPaymentMode}
                  entryFee={actualFee}
                  teamSize={teamSize}
                  memberBalances={selectedTeam.memberBalances}
                  userBalance={wallet?.balance ?? 0}
                />
              </div>
            )}

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
                <span className="text-muted-foreground">Entry Fee (per player):</span>
                <CoinDisplay amount={actualFee} />
              </div>
              {isTeamMatch && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Team Cost ({teamSize} players):</span>
                  <CoinDisplay amount={totalCost} />
                </div>
              )}
              {isTeamMatch && selectedTeam && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment:</span>
                  <span>{paymentMode === 'cover' ? 'You pay all' : 'Split between members'}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">Total Prize Pool:</span>
                <CoinDisplay amount={totalCost * 2 * 0.95} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Platform Fee (5%):</span>
                <CoinDisplay amount={totalCost * 2 * 0.05} />
              </div>
            </div>

            {/* Balance Warning */}
            {!canCreate && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">
                  {isTeamMatch && !selectedTeam 
                    ? 'Select a team to continue'
                    : `Insufficient balance. ${paymentMode === 'cover' ? `You need ${totalCost} Coins.` : 'Some team members need more Coins.'}`}
                  {' '}
                  <Link to="/buy" className="underline font-medium">Buy Coins</Link>
                </span>
              </div>
            )}

            <Button
              size="lg"
              className="w-full glow-blue"
              onClick={handleCreate}
              disabled={creating || !canCreate || !isProfileComplete}
            >
              {creating ? 'Creating...' : 'Create Match'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
