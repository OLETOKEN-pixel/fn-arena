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
  { id: 'game' as const, label: 'Gioco', icon: Gamepad2 },
  { id: 'payments' as const, label: 'Pagamenti', icon: CreditCard },
  { id: 'connections' as const, label: 'Collegamenti', icon: Link2 },
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
  const [paypalEmail, setPaypalEmail] = useState('');
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
      setPaypalEmail(profile.paypal_email || '');
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
          paypal_email: paypalEmail || null,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      toast.success('Profilo aggiornato!');
      
      // Redirect if profile was incomplete and now complete
      if (!isProfileComplete && !!epicUsername && redirectAfterComplete) {
        navigate(redirectAfterComplete, { replace: true });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore durante il salvataggio';
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
      setUsernameError('Username deve avere 3-20 caratteri');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError('Solo lettere, numeri e underscore');
      return;
    }
    
    setUsernameError('');
    setIsSaving(true);
    
    try {
      const result = await changeUsername(username);
      if (result.success) {
        toast.success('Username aggiornato!');
        await refreshProfile();
      } else {
        setUsernameError(result.error || 'Errore durante il cambio username');
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
        throw new Error(error.message || 'Errore durante la connessione');
      }
      
      if (!data?.authUrl) {
        throw new Error('URL di autorizzazione non ricevuto');
      }
      
      // Redirect to Epic OAuth
      window.location.href = data.authUrl;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore durante la connessione a Epic Games';
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
      toast.success('Epic Games scollegato');
      setShowDisconnectEpicDialog(false);
      setEpicUsername('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore durante lo scollegamento';
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
      <div className="h-[calc(100vh-120px)] flex flex-col gap-4">
        {/* Profile Incomplete Alert */}
        {!isProfileComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Completa il Profilo</AlertTitle>
            <AlertDescription>Aggiungi il tuo Epic Games Username per creare o unirti ai match.</AlertDescription>
          </Alert>
        )}

        {/* Profile Summary Header */}
        <Card className="bg-gradient-to-r from-card to-card/80 border-border shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAvatarModal(true)}
                  className="relative group cursor-pointer"
                >
                  <Avatar className="w-16 h-16 border-2 border-primary/30 group-hover:border-primary transition-colors">
                    <AvatarImage 
                      src={discordAvatarUrl || profile.avatar_url || undefined} 
                      alt={profile.username}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                      {profile.username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-medium">Modifica</span>
                  </div>
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold">{discordDisplayName}</h1>
                    {isVip && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-xs">
                        <Crown className="w-3 h-3 mr-1" /> VIP
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  {isDiscordConnected && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <DiscordIcon className="w-3 h-3" />
                      Username sincronizzato da Discord
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                {!isVip && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowVipModal(true)}
                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  >
                    <Crown className="w-4 h-4 mr-1" /> Diventa VIP
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Main Content: Sidebar + Panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 min-h-0">
          {/* Section Navigation */}
          <Card className="p-2 h-fit shrink-0">
            <nav className="flex lg:flex-col gap-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 w-full",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-medium text-sm">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </Card>
          
          {/* Content Panel */}
          <Card className="overflow-y-auto">
            <CardContent className="p-4 lg:p-6">
              {/* Account Section */}
              {activeSection === 'account' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Impostazioni Account</h2>
                  
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
                        {isVip ? "Salva" : <><Crown className="w-4 h-4 mr-1" /> VIP</>}
                      </Button>
                    </div>
                    {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                    {!isVip && (
                      <p className="text-xs text-muted-foreground">
                        🔒 Solo i membri VIP possono cambiare username. Il tuo username proviene da Discord.
                      </p>
                    )}
                  </div>
                  
                  {/* Region & Platform */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Regione Preferita</Label>
                      <Select value={preferredRegion} onValueChange={(v) => setPreferredRegion(v as Region)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona regione" />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Piattaforma Preferita</Label>
                      <Select value={preferredPlatform} onValueChange={(v) => setPreferredPlatform(v as Platform)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona piattaforma" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? 'Salvataggio...' : 'Salva Modifiche'}
                  </Button>
                </div>
              )}
              
              {/* Game Section */}
              {activeSection === 'game' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Account di Gioco</h2>
                  
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
              
              {/* Payments Section */}
              {activeSection === 'payments' && (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold">Metodi di Pagamento</h2>
                  
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">PayPal</p>
                        <p className="text-sm text-muted-foreground">
                          Per ricevere i pagamenti delle vincite
                        </p>
                      </div>
                    </div>
                    {paypalEmail && (
                      <Badge variant="outline" className="text-green-500 border-green-500/50">
                        <Check className="w-3 h-3 mr-1" /> Configurato
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="paypalEmail">Email PayPal</Label>
                    <Input
                      id="paypalEmail"
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      placeholder="La tua email PayPal per i prelievi"
                    />
                  </div>
                  
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? 'Salvataggio...' : 'Salva'}
                  </Button>
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
