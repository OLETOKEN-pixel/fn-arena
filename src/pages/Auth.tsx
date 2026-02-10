import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import logoOleboy from '@/assets/logo-oleboy.png';

// Discord Icon component
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading, isProfileComplete } = useAuth();

  // Get redirect URL from "next" parameter or localStorage (for OAuth callback)
  const urlRedirect = searchParams.get('next') || '/';
  const storedRedirect = typeof window !== 'undefined' ? localStorage.getItem('auth_redirect') : null;
  const redirectTo = storedRedirect || urlRedirect;

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile && !loading) {
      // Clear stored redirect
      localStorage.removeItem('auth_redirect');
      
      // If profile is incomplete, redirect to profile first
      if (!isProfileComplete) {
        const profileRedirect = redirectTo !== '/' ? `/profile?next=${encodeURIComponent(redirectTo)}` : '/profile';
        navigate(profileRedirect, { replace: true });
      } else {
        // Profile is complete, go to intended destination
        navigate(redirectTo, { replace: true });
      }
    }
  }, [user, profile, loading, isProfileComplete, navigate, redirectTo]);

  const handleDiscordSignIn = async () => {
    setIsSubmitting(true);
    try {
      // Store redirect for after OAuth callback
      localStorage.setItem('auth_redirect', redirectTo);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-auth-start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectAfter: redirectTo }),
        }
      );
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to start Discord login');
      }
      
      // Redirect to Discord
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('Discord sign-in error:', err);
      toast({
        title: 'Error',
        description: 'Unable to start Discord login. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative z-[1]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 z-[1]">
      {/* Back button */}
      <Link
        to="/"
        className="absolute top-4 left-4 z-10 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      {/* Auth Card */}
      <Card className="w-full max-w-md relative z-10 bg-card shadow-2xl shadow-primary/5">
        <CardContent className="text-center py-10 px-8">
          {/* Logo */}
          <img
            src={logoOleboy}
            alt="OLEBOY TOKEN"
            className="w-20 h-20 mx-auto mb-6 drop-shadow-lg"
          />
          
          {/* Title */}
          <h1 className="font-display text-2xl font-bold mb-2 text-foreground">
            Sign in to OLEBOY TOKEN
          </h1>
          <p className="text-muted-foreground mb-8">
            The gaming platform for true champions
          </p>
          
          {/* Discord Button - Primary CTA */}
          <Button
            onClick={handleDiscordSignIn}
            disabled={isSubmitting}
            className="w-full py-6 text-lg font-semibold bg-[#5865F2] hover:bg-[#4752C4] text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-[#5865F2]/25"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <DiscordIcon className="w-5 h-5 mr-3" />
                Continue with Discord
              </>
            )}
          </Button>
          
          {/* Terms and Privacy */}
          <p className="text-xs text-muted-foreground mt-8">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>
      
      {/* Bottom decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,255,0.2)] via-50% to-transparent" />
    </div>
  );
}
