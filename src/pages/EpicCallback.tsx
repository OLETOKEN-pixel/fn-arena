import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Status = 'loading' | 'success' | 'error';

export default function EpicCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [epicUsername, setEpicUsername] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      console.log('[EpicCallback] Received params:', { 
        hasCode: !!code, 
        hasState: !!state, 
        error,
        errorDescription 
      });

      // Handle user cancellation or error from Epic
      if (error) {
        setStatus('error');
        setErrorMessage(errorDescription || 'Collegamento annullato');
        return;
      }

      // Validate required params
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Parametri di autorizzazione mancanti. Riprova il collegamento.');
        return;
      }

      // Check if user is authenticated
      if (!user) {
        setStatus('error');
        setErrorMessage('Sessione scaduta. Effettua il login e riprova.');
        return;
      }

      try {
        console.log('[EpicCallback] Calling epic-auth-callback edge function');
        
        const { data, error: invokeError } = await supabase.functions.invoke('epic-auth-callback', {
          body: { code, state }
        });

        console.log('[EpicCallback] Edge function response:', { data, error: invokeError });

        if (invokeError) {
          throw new Error(invokeError.message || 'Errore durante il collegamento');
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Collegamento non riuscito');
        }

        // Success!
        setEpicUsername(data.epicUsername);
        setStatus('success');
        
        // Refresh profile to get updated epic_username
        await refreshProfile();
        
        toast.success(`Epic Games collegato: ${data.epicUsername}`);

        // Auto-redirect after 2 seconds
        setTimeout(() => {
          navigate('/profile?tab=game');
        }, 2000);
      } catch (err: unknown) {
        console.error('[EpicCallback] Error:', err);
        const message = err instanceof Error ? err.message : 'Errore sconosciuto';
        setStatus('error');
        setErrorMessage(message);
      }
    };

    handleCallback();
  }, [searchParams, user, navigate, refreshProfile]);

  return (
    <MainLayout showChat={false}>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center">
            {status === 'loading' && (
              <>
                <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
                <h1 className="text-2xl font-bold mb-2">Collegamento in corso...</h1>
                <p className="text-muted-foreground">
                  Stiamo verificando il tuo account Epic Games
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Epic Games Collegato!</h1>
                <p className="text-muted-foreground mb-4">
                  Il tuo account è stato collegato come <strong>{epicUsername}</strong>
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Verrai reindirizzato al profilo...
                </p>
                <Button asChild className="w-full">
                  <Link to="/profile?tab=game">Vai al Profilo</Link>
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Collegamento Fallito</h1>
                <p className="text-muted-foreground mb-6">{errorMessage}</p>
                <div className="flex flex-col gap-3">
                  <Button asChild variant="default" className="w-full">
                    <Link to="/profile?tab=game">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Riprova
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/">Torna alla Home</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
