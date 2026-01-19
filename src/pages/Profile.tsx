import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { User, Gamepad2, MapPin, Save, AlertTriangle, CreditCard, Link2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { REGIONS, PLATFORMS, type Region, type Platform } from '@/types';
import { LoadingPage } from '@/components/common/LoadingSpinner';

// Provider icons as simple SVG components
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" fill="#5865F2"/>
    </svg>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, profile, loading, refreshProfile, isProfileComplete } = useAuth();

  // Get redirect URL from "next" parameter (set after completing profile)
  const redirectAfterComplete = searchParams.get('next');

  const [epicUsername, setEpicUsername] = useState('');
  const [preferredRegion, setPreferredRegion] = useState<Region>('EU');
  const [preferredPlatform, setPreferredPlatform] = useState<Platform>('PC');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Get linked providers from user identities
  const linkedProviders = user?.identities?.map(i => i.provider) || [];
  const googleIdentity = user?.identities?.find(i => i.provider === 'google');
  const googleEmail = googleIdentity?.identity_data?.email as string | undefined;

  useEffect(() => {
    if (!user && !loading) {
      navigate(`/auth?next=${encodeURIComponent(location.pathname)}`);
    }
  }, [user, loading, navigate, location.pathname]);

  useEffect(() => {
    if (profile) {
      setEpicUsername(profile.epic_username ?? '');
      setPreferredRegion(profile.preferred_region as Region);
      setPreferredPlatform(profile.preferred_platform as Platform);
      setPaypalEmail(profile.paypal_email ?? '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        epic_username: epicUsername || null,
        preferred_region: preferredRegion,
        preferred_platform: preferredPlatform,
        paypal_email: paypalEmail || null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare il profilo.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Profilo aggiornato',
        description: 'Le modifiche sono state salvate.',
      });
      await refreshProfile();
      
      // If profile was incomplete and now has epic username, redirect to intended page
      const wasIncomplete = !isProfileComplete;
      const nowComplete = !!epicUsername;
      if (wasIncomplete && nowComplete && redirectAfterComplete) {
        navigate(redirectAfterComplete, { replace: true });
      }
    }

    setSaving(false);
  };

  const handleLinkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/profile`,
      },
    });
    
    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile collegare account Google.',
        variant: 'destructive',
      });
    }
  };

  if (loading) return <MainLayout><LoadingPage /></MainLayout>;
  if (!profile) return null;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-display text-3xl font-bold">Profilo</h1>

        {/* Epic Username Warning */}
        {!isProfileComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Completa il Profilo</AlertTitle>
            <AlertDescription>
              Aggiungi il tuo Epic Games Username per creare o unirti ai match.
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                  {profile.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{profile.username}</CardTitle>
                <CardDescription>{profile.email}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Epic Username */}
            <div className="space-y-2">
              <Label htmlFor="epic" className="flex items-center gap-2">
                <Gamepad2 className="w-4 h-4" />
                Epic Games Username
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="epic"
                placeholder="Il tuo username Epic Games"
                value={epicUsername}
                onChange={(e) => setEpicUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Richiesto per giocare. Assicurati che corrisponda al tuo account FN.
              </p>
            </div>

            {/* Preferred Region */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Regione Preferita
              </Label>
              <Select value={preferredRegion} onValueChange={(v) => setPreferredRegion(v as Region)}>
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

            {/* Preferred Platform */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Piattaforma Preferita
              </Label>
              <Select value={preferredPlatform} onValueChange={(v) => setPreferredPlatform(v as Platform)}>
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

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Salvataggio...' : 'Salva Modifiche'}
            </Button>
          </CardContent>
        </Card>

        {/* Linked Accounts Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Account Collegati
            </CardTitle>
            <CardDescription>
              Gestisci i tuoi metodi di accesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Google */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                  <GoogleIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium">Google</p>
                  {linkedProviders.includes('google') ? (
                    <p className="text-xs text-muted-foreground">{googleEmail}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Non collegato</p>
                  )}
                </div>
              </div>
              {linkedProviders.includes('google') ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  Collegato
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={handleLinkGoogle}>
                  Collega
                </Button>
              )}
            </div>

            {/* Discord - Not available */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center">
                  <DiscordIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium">Discord</p>
                  <p className="text-xs text-muted-foreground">Non disponibile</p>
                </div>
              </div>
              <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                Coming Soon
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Payment Details Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Dati di Pagamento
            </CardTitle>
            <CardDescription>
              Necessari per ricevere i prelievi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paypal">Email PayPal</Label>
              <Input
                id="paypal"
                type="email"
                placeholder="email@paypal.com"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Unico metodo di pagamento per i prelievi.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} variant="outline" className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Salvataggio...' : 'Salva Dati Pagamento'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
