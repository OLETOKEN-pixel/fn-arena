import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, 
  Gamepad2, 
  CreditCard, 
  Link2, 
  Crown,
  Check,
  ExternalLink,
  Save,
  Loader2,
  Unlink
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useVipStatus } from '@/hooks/useVipStatus';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VipModal } from '@/components/vip/VipModal';
import { ProfileAvatarSection } from '@/components/avatars/ProfileAvatarSection';
import { LoadingPage } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { REGIONS, PLATFORMS, type Region, type Platform } from '@/types';
import { AlertTriangle } from 'lucide-react';

// Discord Icon
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="currentColor" d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
    </svg>
  );
}

type ProfileSection = 'account' | 'game' | 'payments' | 'connections';

const sections = [
  { id: 'account' as const, label: 'Account', icon: User },
  { id: 'game' as const, label: 'Game', icon: Gamepad2 },
  { id: 'payments' as const, label: 'Payments', icon: CreditCard },
  { id: 'connections' as const, label: 'Connections', icon: Link2 },
];

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, loading, refreshProfile, isProfileComplete } = useAuth();
  const { isVip, changeUsername } = useVipStatus();
  
  const [activeSection, setActiveSection] = useState<ProfileSection>('account');
  const [showVipModal, setShowVipModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  
  // Form state
  const [username, setUsername] = useState('');
  const [epicUsername, setEpicUsername] = useState('');
  const [preferredRegion, setPreferredRegion] = useState<Region>('EU');
  const [preferredPlatform, setPreferredPlatform] = useState<Platform>('PC');
  const [isSaving, setIsSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  
  // Epic OAuth state
  const [isConnectingEpic, setIsConnectingEpic] = useState(false);
  const [showDisconnectEpicDialog, setShowDisconnectEpicDialog] = useState(false);
  const [isDisconnectingEpic, setIsDisconnectingEpic] = useState(false);

  const redirectAfterComplete = searchParams.get('next');
  
  // Check if Epic is connected via OAuth (has epic_account_id)
  const isEpicConnected = !!profile?.epic_account_id;
  
  // Check if Discord is connected
  const isDiscordConnected = !!profile?.discord_user_id;

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !loading) {
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [user, loading, navigate]);

  // Populate form from profile
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setEpicUsername(profile.epic_username || '');
      setPreferredRegion((profile.preferred_region as Region) || 'EU');
      setPreferredPlatform((profile.preferred_platform as Platform) || 'PC');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          epic_username: epicUsername || null,
          preferred_region: preferredRegion,
          preferred_platform: preferredPlatform,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      toast.success('Profile updated!');
      
      // Redirect if profile was incomplete and now complete
      if (!isProfileComplete && !!epicUsername && redirectAfterComplete) {
        navigate(redirectAfterComplete, { replace: true });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error saving changes';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!isVip) {
      setShowVipModal(true);
      return;
    }
    
    if (username.length < 3 || username.length > 20) {
      setUsernameError('Username must be 3-20 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError('Letters, numbers and underscores only');
      return;
    }
    
    setUsernameError('');
    setIsSaving(true);
    
    try {
      const result = await changeUsername(username);
      if (result.success) {
        toast.success('Username updated!');
        await refreshProfile();
      } else {
        setUsernameError(result.error || 'Error changing username');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectEpic = async () => {
    setIsConnectingEpic(true);
    try {
      const { data, error } = await supabase.functions.invoke('epic-auth-start');
      
      if (error) {
        throw new Error(error.message || 'Connection error');
      }
      
      if (!data?.authUrl) {
        throw new Error('Authorization URL not received');
      }
      
      // Redirect to Epic OAuth
      window.location.href = data.authUrl;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error connecting to Epic Games';
      toast.error(message);
      setIsConnectingEpic(false);
    }
  };

  const handleDisconnectEpic = async () => {
    if (!user) return;
    
    setIsDisconnectingEpic(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          epic_account_id: null,
          epic_username: null,
          epic_linked_at: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Epic Games disconnected');
      setShowDisconnectEpicDialog(false);
      setEpicUsername('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error disconnecting';
      toast.error(message);
    } finally {
      setIsDisconnectingEpic(false);
    }
  };

  if (loading) return <MainLayout><LoadingPage /></MainLayout>;
  if (!user || !profile) return null;

  // Get Discord display info
  const discordDisplayName = profile.discord_display_name || profile.discord_username || profile.username;
  const discordAvatarUrl = profile.discord_avatar_url;

  return (
    <MainLayout>
      {/* Profile uses full container width for 1920×1080 */}
      <div className="min-h-0 lg:min-h-[calc(100vh-var(--header-height)-4rem)] flex flex-col gap-4 lg:gap-8">
        {/* Profile Incomplete Alert */}
        {!isProfileComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Complete Your Profile</AlertTitle>
            <AlertDescription>Add your Epic Games Username to create or join matches.</AlertDescription>
          </Alert>
        )}

        {/* Profile Summary Header - Bigger on desktop */}
        <Card className="bg-gradient-to-r from-card to-card/80 border-border shrink-0">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4 lg:gap-6">
              <div className="flex items-center gap-4 lg:gap-6">
                <button
                  onClick={() => setShowAvatarModal(true)}
                  className="relative group cursor-pointer"
                >
                  <Avatar className="w-16 h-16 lg:w-20 lg:h-20 border-2 border-primary/30 group-hover:border-primary transition-colors">
                    <AvatarImage 
                      src={discordAvatarUrl || profile.avatar_url || undefined} 
                      alt={profile.username}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl lg:text-2xl">
                      {profile.username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs lg:text-sm text-white font-medium">Edit</span>
                  </div>
                </button>
                <div>
                  <div className="flex items-center gap-2 lg:gap-3">
                    <h1 className="text-xl lg:text-2xl font-bold">{discordDisplayName}</h1>
                    {isVip && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xs lg:text-sm">
                        <Crown className="w-3 h-3 lg:w-4 lg:h-4 mr-1" /> VIP
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm lg:text-base text-muted-foreground">{profile.email}</p>
                  {isDiscordConnected && (
                    <p className="text-xs lg:text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <DiscordIcon className="w-3 h-3 lg:w-4 lg:h-4" />
                      Username synced from Discord
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 lg:gap-3">
                {!isVip && (
                  <Button 
                    variant="outline" 
                    size="default"
                    onClick={() => setShowVipModal(true)}
                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 lg:h-11 lg:px-5"
                  >
                    <Crown className="w-4 h-4 mr-1" /> Become VIP
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Main Content: Sidebar + Panel - WIDER for 1920 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-8 min-h-0">
          {/* Section Navigation - Bigger on desktop */}
          <Card className="p-2 lg:p-4 h-fit shrink-0">
            <nav className="flex lg:flex-col gap-1 lg:gap-2">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex items-center gap-3 lg:gap-4 px-3 lg:px-4 py-2.5 lg:py-3.5 rounded-lg lg:rounded-xl text-left transition-all duration-200 w-full",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
                    <span className="font-medium text-sm lg:text-base">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </Card>
          
          {/* Content Panel - Bigger padding on desktop */}
          <Card className="overflow-y-auto">
            <CardContent className="p-4 lg:p-8">
              {/* Account Section */}
              {activeSection === 'account' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Account Settings</h2>
                  
                  {/* Username (from Discord) */}
                  <div className="space-y-2">
                    <Label htmlFor="username" className="flex items-center gap-2">
                      Username
                      {isVip && <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">VIP</Badge>}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
                        className={cn("flex-1", usernameError && "border-destructive")}
                        disabled={!isVip}
                      />
                      <Button 
                        onClick={handleSaveUsername}
                        disabled={isSaving || username === profile.username}
                        variant={isVip ? "default" : "outline"}
                        className={!isVip ? "border-amber-500/50 text-amber-500" : ""}
                      >
                        {isVip ? "Save" : <><Crown className="w-4 h-4 mr-1" /> VIP</>}
                      </Button>
                    </div>
                    {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                    {!isVip && (
                      <p className="text-xs text-muted-foreground">
                        🔒 Only VIP members can change username. Your username comes from Discord.
                      </p>
                    )}
                  </div>
                  
                  {/* Region & Platform */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Preferred Region</Label>
                      <Select value={preferredRegion} onValueChange={(v) => setPreferredRegion(v as Region)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Preferred Platform</Label>
                      <Select value={preferredPlatform} onValueChange={(v) => setPreferredPlatform(v as Platform)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
              
              {/* Game Section */}
              {activeSection === 'game' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Game Accounts</h2>
                  
                  {/* Epic Games Card */}
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                          <Gamepad2 className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">Epic Games</p>
                          <p className="text-sm text-muted-foreground">
                            {isEpicConnected ? profile.epic_username : 'Non connesso'}
                          </p>
                        </div>
                      </div>
                      
                      {isEpicConnected ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/50">
                          <Check className="w-3 h-3 mr-1" /> Verificato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Non connesso
                        </Badge>
                      )}
                    </div>
                    
                    {/* If NOT connected: show Connect button */}
                    {!isEpicConnected && (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Collega il tuo account Epic Games per importare automaticamente il tuo Epic Username e partecipare ai match.
                        </p>
                        <Button 
                          onClick={handleConnectEpic}
                          className="w-full"
                          disabled={isConnectingEpic}
                        >
                          {isConnectingEpic ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Collegamento in corso...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Collega Epic Games
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    
                    {/* If connected: show verified username + Disconnect */}
                    {isEpicConnected && (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-muted-foreground text-xs">Epic Username (verificato)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input 
                              value={profile.epic_username || ''} 
                              readOnly 
                              className="bg-muted/50 cursor-not-allowed flex-1"
                            />
                            <Badge className="shrink-0 bg-green-500/20 text-green-500 border-green-500/30">
                              <Check className="w-3 h-3 mr-1" /> Verificato
                            </Badge>
                          </div>
                          {profile.epic_linked_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Collegato il {new Date(profile.epic_linked_at).toLocaleDateString('it-IT')}
                            </p>
                          )}
                        </div>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowDisconnectEpicDialog(true)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Unlink className="w-4 h-4 mr-2" />
                          Scollega Epic Games
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Avatar Section */}
                  <div className="pt-4 border-t border-border">
                    <h3 className="font-medium mb-3">Avatar</h3>
                    <ProfileAvatarSection />
                  </div>
                </div>
              )}
              
              {/* Payments Section - Stripe Only */}
              {activeSection === 'payments' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Pagamenti</h2>
                  
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">Stripe Connect</p>
                        <p className="text-sm text-muted-foreground">
                          Per ricevere i pagamenti delle vincite
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-3">
                        Configura e gestisci i prelievi dalla pagina Wallet.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate('/wallet')}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Vai al Wallet
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Connections Section - ONLY DISCORD */}
              {activeSection === 'connections' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Account Collegato</h2>
                  
                  {/* Discord - Always Connected (it's the only auth method) */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={discordAvatarUrl || undefined} />
                        <AvatarFallback className="bg-[#5865F2]">
                          <DiscordIcon className="w-5 h-5 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">Discord</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.discord_username || discordDisplayName}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-green-500 border-green-500/50">
                      <Check className="w-3 h-3 mr-1" /> Connesso
                    </Badge>
                  </div>
                  
                  {profile.discord_linked_at && (
                    <p className="text-sm text-muted-foreground">
                      Account collegato il {new Date(profile.discord_linked_at).toLocaleDateString('it-IT')}
                    </p>
                  )}
                  
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-sm text-muted-foreground">
                      Il tuo account OLEBOY TOKEN è collegato a Discord. 
                      Per accedere con un altro account, effettua il logout e accedi nuovamente con un diverso account Discord.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <VipModal open={showVipModal} onOpenChange={setShowVipModal} />
      
      {/* Avatar Modal */}
      {showAvatarModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowAvatarModal(false)}
        >
          <Card 
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>Gestisci Avatar</CardTitle>
              <CardDescription>Seleziona un avatar o acquistane uno nuovo</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileAvatarSection />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Epic Games Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectEpicDialog} onOpenChange={setShowDisconnectEpicDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare Epic Games?</AlertDialogTitle>
            <AlertDialogDescription>
              Dovrai ricollegare il tuo account Epic Games per partecipare ai match.
              Il tuo Epic Username verificato verrà rimosso dal profilo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnectingEpic}>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDisconnectEpic}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDisconnectingEpic}
            >
              {isDisconnectingEpic ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scollegamento...
                </>
              ) : (
                'Scollega'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
