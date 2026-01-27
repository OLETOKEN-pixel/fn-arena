import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Check, CreditCard, Info } from 'lucide-react';
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

const PROCESSING_FEE = 0.50;
const MIN_COINS = 5;

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
  const finalPrice = finalAmount + PROCESSING_FEE;
  const isValidAmount = finalAmount >= MIN_COINS;

  const handleCheckout = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!isValidAmount) {
      toast({
        title: 'Importo non valido',
        description: `Il minimo acquisto è di ${MIN_COINS} Coins.`,
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { amount: finalAmount },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile avviare il pagamento. Riprova.',
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
          Torna al Wallet
        </Link>

        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Compra Coins</h1>
          <p className="text-muted-foreground">
            1 Coin = €1 • Consegna istantanea • Pagamento sicuro
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
                  Popolare
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
                    Selezionato
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Custom Amount */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Importo Personalizzato</CardTitle>
            <CardDescription>Inserisci un importo (minimo €{MIN_COINS})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="custom">Importo in €</Label>
                <Input
                  id="custom"
                  type="number"
                  placeholder={`Minimo ${MIN_COINS}`}
                  value={customAmount}
                  onChange={(e) => handleCustomAmount(e.target.value)}
                  min={MIN_COINS}
                  step={1}
                />
              </div>
              <div className="flex-1">
                <Label>Riceverai</Label>
                <div className="h-10 flex items-center">
                  <CoinDisplay amount={customAmount ? parseFloat(customAmount) : 0} size="lg" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checkout Summary */}
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="py-6">
            {/* Price breakdown */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coins</span>
                <span>€{finalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  Commissione
                  <Info className="w-3 h-3" />
                </span>
                <span>€{PROCESSING_FEE.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>Totale</span>
                <span>€{isValidAmount ? finalPrice.toFixed(2) : '0.00'}</span>
              </div>
            </div>

            {/* Coins you'll receive */}
            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground">Riceverai</p>
              <CoinDisplay 
                amount={isValidAmount ? finalAmount : 0} 
                size="lg" 
                className="glow-text-gold" 
              />
            </div>

            {/* Checkout button */}
            <Button
              size="lg"
              className="w-full glow-blue"
              onClick={handleCheckout}
              disabled={processing || !isValidAmount}
            >
              {processing ? (
                'Elaborazione...'
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {user ? 'Paga ora' : 'Accedi per acquistare'}
                </>
              )}
            </Button>

            {/* Payment info */}
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="w-4 h-4" />
              <span>Pagamento sicuro tramite Stripe</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
