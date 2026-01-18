import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Check, CreditCard } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { CoinIcon } from '@/components/common/CoinIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { COIN_PACKAGES, type CoinPackage } from '@/types';
import { cn } from '@/lib/utils';

type PaymentMethod = 'stripe' | 'paypal';

export default function BuyCoins() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');

  const handleSelectPackage = (pkg: CoinPackage) => {
    setSelectedPackage(pkg);
    setCustomAmount('');
  };

  const handleCustomAmount = (value: string) => {
    setCustomAmount(value);
    setSelectedPackage(null);
  };

  const finalAmount = customAmount ? parseFloat(customAmount) : (selectedPackage?.coins ?? 0);
  const finalPrice = customAmount ? parseFloat(customAmount) : (selectedPackage?.price ?? 0);

  const handleCheckout = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (finalAmount < 1) {
      toast({
        title: 'Invalid amount',
        description: 'Minimum purchase is 1 Coin (€1).',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      if (paymentMethod === 'stripe') {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { amount: finalAmount },
        });

        if (error) throw error;

        if (data?.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL received');
        }
      } else {
        // PayPal checkout
        const { data, error } = await supabase.functions.invoke('create-paypal-order', {
          body: { amount: finalAmount },
        });

        if (error) throw error;

        if (data?.approvalUrl) {
          window.location.href = data.approvalUrl;
        } else {
          throw new Error('No PayPal approval URL received');
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create checkout session. Please try again.',
        variant: 'destructive',
      });
      setProcessing(false);
    }
  };

  return (
    <MainLayout showChat={false}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <Link
          to="/wallet"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Wallet
        </Link>

        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Buy Coins</h1>
          <p className="text-muted-foreground">
            1 Coin = €1 • Instant delivery • Secure payment
          </p>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {COIN_PACKAGES.map((pkg) => (
            <Card
              key={pkg.id}
              className={cn(
                'cursor-pointer transition-all duration-200 card-hover',
                selectedPackage?.id === pkg.id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50',
                pkg.popular && 'relative overflow-hidden'
              )}
              onClick={() => handleSelectPackage(pkg)}
            >
              {pkg.popular && (
                <div className="absolute top-0 right-0 bg-accent text-accent-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
                  Popular
                </div>
              )}
              <CardContent className="pt-6 text-center">
                <div className="mb-4 flex justify-center">
                  <CoinIcon size={selectedPackage?.id === pkg.id ? 'xl' : 'lg'} />
                </div>
                <p className="text-2xl font-bold mb-1">
                  {pkg.coins} Coins
                  {pkg.bonus && (
                    <span className="text-sm text-success ml-2">+{pkg.bonus} bonus</span>
                  )}
                </p>
                <p className="text-muted-foreground">€{pkg.price}</p>
                {selectedPackage?.id === pkg.id && (
                  <div className="mt-4 flex items-center justify-center gap-1 text-primary">
                    <Check className="w-4 h-4" />
                    Selected
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Custom Amount */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Custom Amount</CardTitle>
            <CardDescription>Enter any amount (minimum €1)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="custom">Amount in €</Label>
                <Input
                  id="custom"
                  type="number"
                  placeholder="Enter amount"
                  value={customAmount}
                  onChange={(e) => handleCustomAmount(e.target.value)}
                  min={1}
                  step={1}
                />
              </div>
              <div className="flex-1">
                <Label>You'll receive</Label>
                <div className="h-10 flex items-center">
                  <CoinDisplay amount={customAmount ? parseFloat(customAmount) : 0} size="lg" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Selection */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Payment Method</CardTitle>
            <CardDescription>Choose how you want to pay</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('stripe')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200',
                  paymentMethod === 'stripe'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <CreditCard className="w-8 h-8 text-primary" />
                <div className="text-left">
                  <p className="font-semibold">Credit Card</p>
                  <p className="text-xs text-muted-foreground">Visa, Mastercard, etc.</p>
                </div>
                {paymentMethod === 'stripe' && (
                  <Check className="w-5 h-5 text-primary ml-auto" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('paypal')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200',
                  paymentMethod === 'paypal'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                  <path d="M7.02 21L7.5 18H5.5L8.5 3H15.5C17.14 3 18.47 3.5 19.29 4.41C20.11 5.33 20.36 6.56 20.01 8.01C19.59 9.73 18.59 11.06 17.18 11.88C15.8 12.68 14.03 13.08 12.03 13.08H10.03L9.03 18.08L8.5 21H7.02Z" fill="#003087"/>
                  <path d="M8.5 18L9 15H11C12.63 15 14.12 14.69 15.29 14.05C16.47 13.4 17.29 12.4 17.67 11.13C18.05 9.87 17.83 8.73 17.11 7.87C16.39 7 15.27 6.54 13.87 6.54H10.87L8.5 18Z" fill="#009CDE"/>
                </svg>
                <div className="text-left">
                  <p className="font-semibold">PayPal</p>
                  <p className="text-xs text-muted-foreground">Pay with PayPal balance</p>
                </div>
                {paymentMethod === 'paypal' && (
                  <Check className="w-5 h-5 text-primary ml-auto" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Checkout */}
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold">€{finalPrice.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">You'll receive</p>
                <CoinDisplay amount={finalAmount} size="lg" className="glow-text-gold" />
              </div>
            </div>
            <Button
              size="lg"
              className="w-full glow-blue"
              onClick={handleCheckout}
              disabled={processing || finalAmount < 1}
            >
              {processing ? (
                'Processing...'
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {user ? `Pay with ${paymentMethod === 'stripe' ? 'Card' : 'PayPal'}` : 'Sign In to Buy'}
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Secure payment powered by {paymentMethod === 'stripe' ? 'Stripe' : 'PayPal'}
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
