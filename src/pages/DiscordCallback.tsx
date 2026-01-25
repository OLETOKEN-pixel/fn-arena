import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logoOleboy from '@/assets/logo-oleboy.png';

type CallbackStatus = 'loading' | 'success' | 'error';

export default function DiscordCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle Discord errors
      if (error) {
        setStatus('error');
        if (error === 'access_denied') {
          setErrorMessage('Hai annullato l\'autorizzazione Discord');
        } else {
          setErrorMessage(errorDescription || 'Errore durante l\'autorizzazione Discord');
        }
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Parametri mancanti nella risposta di Discord');
        return;
      }

      try {
        // Call the edge function to complete the OAuth flow
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-auth-callback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          setStatus('error');
          setErrorMessage(data.error || 'Errore durante il login con Discord');
          return;
        }

        // Set the session using the tokens from the magic link
        if (data.accessToken && data.refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          });

          if (sessionError) {
            console.error('Session error:', sessionError);
            setStatus('error');
            setErrorMessage('Errore durante la creazione della sessione');
            return;
          }
        }

        setStatus('success');
        toast({
          title: 'Benvenuto!',
          description: 'Login con Discord completato con successo',
        });

        // Clear any stored redirect
        localStorage.removeItem('auth_redirect');

        // Small delay to allow session to propagate
        setTimeout(() => {
          navigate(data.redirectTo || '/', { replace: true });
        }, 500);
      } catch (err) {
        console.error('Discord callback error:', err);
        setStatus('error');
        setErrorMessage('Errore di connessione. Riprova.');
      }
    };

    handleCallback();
  }, [searchParams, navigate, toast]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 gradient-radial opacity-20 pointer-events-none" />

      {status === 'loading' && (
        <div className="text-center">
          <img
            src={logoOleboy}
            alt="OLEBOY TOKEN"
            className="w-16 h-16 mx-auto mb-6"
          />
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Connessione a Discord...</p>
        </div>
      )}

      {status === 'error' && (
        <Card className="w-full max-w-md bg-card border-border">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold mt-4">Errore</h2>
            <p className="text-muted-foreground mt-2">{errorMessage}</p>
            <div className="flex flex-col gap-2 mt-6">
              <Button onClick={() => navigate('/auth')} className="w-full">
                Torna al Login
              </Button>
              <Link
                to="/"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alla Home
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'success' && (
        <div className="text-center">
          <img
            src={logoOleboy}
            alt="OLEBOY TOKEN"
            className="w-16 h-16 mx-auto mb-6"
          />
          <div className="w-8 h-8 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="mt-4 text-muted-foreground">Login completato! Reindirizzamento...</p>
        </div>
      )}
    </div>
  );
}
