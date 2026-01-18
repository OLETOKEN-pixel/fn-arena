import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CoinIcon } from '@/components/common/CoinIcon';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
      const orderId = searchParams.get('orderId');
      const provider = searchParams.get('provider');

      // Handle PayPal return
      if (provider === 'paypal' && orderId) {
        try {
          const { data, error } = await supabase.functions.invoke('capture-paypal-order', {
            body: { orderId },
          });

          if (error) throw error;

          if (data?.success) {
            setCoins(data.coins || 0);
            setStatus('success');
            await refreshWallet();
          } else {
            throw new Error(data?.error || 'Payment capture failed');
          }
        } catch (error) {
          console.error('PayPal capture error:', error);
          setErrorMessage(error instanceof Error ? error.message : 'Payment failed');
          setStatus('error');
        }
        return;
      }

      // Handle Stripe success (already processed via webhook)
      const stripeSuccess = searchParams.get('success');
      const stripeCoins = searchParams.get('coins');
      if (stripeSuccess === 'true') {
        setCoins(parseFloat(stripeCoins || '0'));
        setStatus('success');
        await refreshWallet();
        return;
      }

      // Handle cancel
      const canceled = searchParams.get('canceled');
      if (canceled === 'true') {
        setErrorMessage('Payment was canceled');
        setStatus('error');
        return;
      }

      // Unknown state
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
          <p className="text-muted-foreground">Processing your payment...</p>
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
                  Payment Successful!
                </h1>
                {coins > 0 && (
                  <p className="text-muted-foreground mb-4">
                    You've received <CoinDisplay amount={coins} size="lg" className="inline-flex" />
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-6">
                  Your coins have been added to your wallet.
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/wallet">Go to Wallet</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/matches">Browse Matches</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 flex justify-center">
                  <XCircle className="w-16 h-16 text-destructive" />
                </div>
                <h1 className="font-display text-2xl font-bold mb-2 text-destructive">
                  Payment Failed
                </h1>
                <p className="text-muted-foreground mb-6">
                  {errorMessage || 'Something went wrong with your payment.'}
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/buy">Try Again</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/">Go Home</Link>
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
