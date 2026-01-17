import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Coins, Sparkles, Check } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { COIN_PACKAGES, type CoinPackage } from '@/types';
import { cn } from '@/lib/utils';

export default function BuyCoins() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);

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

    // TODO: Implement Stripe checkout
    toast({
      title: 'Coming soon!',
      description: 'Stripe payment integration will be added next.',
    });

    setProcessing(false);
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
                <div className="mb-4">
                  <Coins className={cn(
                    'w-10 h-10 mx-auto',
                    selectedPackage?.id === pkg.id ? 'text-accent' : 'text-muted-foreground'
                  )} />
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
                  {user ? 'Proceed to Checkout' : 'Sign In to Buy'}
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Secure payment powered by Stripe
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
