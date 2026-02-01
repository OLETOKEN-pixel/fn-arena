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
        setErrorMessage(errorDescription || 'Connection canceled');
        return;
      }

      // Validate required params
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Missing authorization parameters. Please try again.');
        return;
      }

      // Check if user is authenticated
      if (!user) {
        setStatus('error');
        setErrorMessage('Session expired. Please log in and try again.');
        return;
      }

      try {
        console.log('[EpicCallback] Calling epic-auth-callback edge function');
        
        const { data, error: invokeError } = await supabase.functions.invoke('epic-auth-callback', {
          body: { code, state }
        });

        console.log('[EpicCallback] Edge function response:', { data, error: invokeError });

        if (invokeError) {
          throw new Error(invokeError.message || 'Connection error');
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Connection failed');
        }

        // Success!
        setEpicUsername(data.epicUsername);
        setStatus('success');
        
        // Refresh profile to get updated epic_username
        await refreshProfile();
        
        toast.success(`Epic Games connected: ${data.epicUsername}`);

        // Auto-redirect after 2 seconds
        setTimeout(() => {
          navigate('/profile?tab=game');
        }, 2000);
      } catch (err: unknown) {
        console.error('[EpicCallback] Error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
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
                <h1 className="text-2xl font-bold mb-2">Connecting...</h1>
                <p className="text-muted-foreground">
                  Verifying your Epic Games account
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Epic Games Connected!</h1>
                <p className="text-muted-foreground mb-4">
                  Your account is now linked as <strong>{epicUsername}</strong>
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Redirecting to profile...
                </p>
                <Button asChild className="w-full">
                  <Link to="/profile?tab=game">Go to Profile</Link>
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Connection Failed</h1>
                <p className="text-muted-foreground mb-6">{errorMessage}</p>
                <div className="flex flex-col gap-3">
                  <Button asChild variant="default" className="w-full">
                    <Link to="/profile?tab=game">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/">Back to Home</Link>
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
