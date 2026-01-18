import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Gamepad2, MapPin, Save, AlertTriangle, CreditCard } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { REGIONS, PLATFORMS, type Region, type Platform } from '@/types';
import { LoadingPage } from '@/components/common/LoadingSpinner';

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, profile, loading, refreshProfile, isProfileComplete } = useAuth();

  const [epicUsername, setEpicUsername] = useState('');
  const [preferredRegion, setPreferredRegion] = useState<Region>('EU');
  const [preferredPlatform, setPreferredPlatform] = useState<Platform>('PC');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [iban, setIban] = useState('');
  const [saving, setSaving] = useState(false);

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
      setIban(profile.iban ?? '');
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
        iban: iban || null,
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
    }

    setSaving(false);
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="iban">IBAN (per Bonifico)</Label>
              <Input
                id="iban"
                placeholder="IT60X0542811101000000123456"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} variant="outline" className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Salvataggio...' : 'Salva Dati Pagamento'}
            </Button>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Storico Match</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Nessun match giocato.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
