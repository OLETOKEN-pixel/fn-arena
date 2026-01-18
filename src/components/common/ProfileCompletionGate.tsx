import { Link } from 'react-router-dom';
import { AlertTriangle, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileCompletionGateProps {
  children: React.ReactNode;
}

export function ProfileCompletionGate({ children }: ProfileCompletionGateProps) {
  const { user, profile, isProfileComplete, loading } = useAuth();

  // Don't block if still loading or not logged in
  if (loading || !user) {
    return <>{children}</>;
  }

  // Block if profile exists but is incomplete
  if (profile && !isProfileComplete) {
    return (
      <div className="relative min-h-[60vh]">
        {/* Blurred content underneath */}
        <div className="blur-sm pointer-events-none opacity-50" aria-hidden="true">
          {children}
        </div>

        {/* Overlay modal */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
          <Card className="max-w-md mx-4 shadow-xl border-accent/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="text-xl">Completa il tuo Profilo</CardTitle>
              <CardDescription className="text-base">
                Per accedere a questa funzione, devi prima aggiungere il tuo <strong>Epic Games Username</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                L'Epic Username è necessario per identificarti nei match e permettere agli avversari di aggiungerti in gioco.
              </p>
              <Button asChild className="w-full glow-blue" size="lg">
                <Link to="/profile">
                  <User className="w-4 h-4 mr-2" />
                  Completa Profilo
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
