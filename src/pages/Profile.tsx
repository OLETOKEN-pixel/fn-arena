import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Gamepad2, MapPin, Save, AlertTriangle } from 'lucide-react';
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
  const { toast } = useToast();
  const { user, profile, loading, refreshProfile, isProfileComplete } = useAuth();

  const [epicUsername, setEpicUsername] = useState('');
  const [preferredRegion, setPreferredRegion] = useState<Region>('EU');
  const [preferredPlatform, setPreferredPlatform] = useState<Platform>('PC');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user && !loading) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setEpicUsername(profile.epic_username ?? '');
      setPreferredRegion(profile.preferred_region as Region);
      setPreferredPlatform(profile.preferred_platform as Platform);
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
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Profile updated',
        description: 'Your changes have been saved.',
      });
      await refreshProfile();
    }

    setSaving(false);
  };

  if (loading) return <MainLayout><LoadingPage /></MainLayout>;
  if (!profile) return null;

  return (
    <MainLayout showChat={false}>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-display text-3xl font-bold">Profile</h1>

        {/* Epic Username Warning */}
        {!isProfileComplete && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Complete Your Profile</AlertTitle>
            <AlertDescription>
              Add your Epic Games Username below to create or join matches.
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
                placeholder="Your Epic Games username"
                value={epicUsername}
                onChange={(e) => setEpicUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is required to play matches. Make sure it matches your FN account.
              </p>
            </div>

            {/* Preferred Region */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Preferred Region
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
                Preferred Platform
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
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Match History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              No matches played yet.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
