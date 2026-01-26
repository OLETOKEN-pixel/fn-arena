import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CoinIcon } from '@/components/common/CoinIcon';
import { useAuth } from '@/contexts/AuthContext';

type Status = 'loading' | 'success' | 'error';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshWallet } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [coins, setCoins] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handlePayment = async () => {
      const success = searchParams.get('success');
      const coinsParam = searchParams.get('coins');
      const canceled = searchParams.get('canceled');

      console.log('[PaymentSuccess] Page loaded', {
        success,
        coins: coinsParam,
        canceled,
        fullUrl: window.location.href,
      });

      // Handle cancel
      if (canceled === 'true') {
        setErrorMessage('Pagamento annullato');
        setStatus('error');
        return;
      }

      // Handle Stripe success (processed via webhook)
      if (success === 'true') {
        setCoins(parseFloat(coinsParam || '0'));
        setStatus('success');
        await refreshWallet();
        return;
      }

      // Unknown state - assume success
      setStatus('success');
    };

    if (user) {
      handlePayment();
    } else {
      navigate('/auth');
    }
  }, [searchParams, user, navigate, refreshWallet]);

  if (status === 'loading') {
    return (
      <MainLayout showChat={false}>
        <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Elaborazione del pagamento...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showChat={false}>
      <div className="max-w-md mx-auto">
        <Card className="text-center">
          <CardContent className="pt-8 pb-6">
            {status === 'success' ? (
              <>
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <CoinIcon size="hero" className="animate-bounce" />
                    <CheckCircle className="absolute -bottom-1 -right-1 w-8 h-8 text-success bg-background rounded-full" />
                  </div>
                </div>
                <h1 className="font-display text-2xl font-bold mb-2 text-success">
                  Pagamento Riuscito!
                </h1>
                {coins > 0 && (
                  <p className="text-muted-foreground mb-4">
                    Hai ricevuto <CoinDisplay amount={coins} size="lg" className="inline-flex" />
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-6">
                  I tuoi coins sono stati aggiunti al wallet.
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/wallet">Vai al Wallet</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/matches">Sfoglia Match</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 flex justify-center">
                  <XCircle className="w-16 h-16 text-destructive" />
                </div>
                <h1 className="font-display text-2xl font-bold mb-2 text-destructive">
                  Pagamento Fallito
                </h1>
                <p className="text-muted-foreground mb-6">
                  {errorMessage || 'Si è verificato un errore con il pagamento.'}
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/buy">Riprova</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
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
