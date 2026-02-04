import { useState, useEffect, useRef } from 'react';
import { Sparkles, Gift, Lock, Search, Loader2, Send, CreditCard, Check, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CoinIcon } from '@/components/common/CoinIcon';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { useVipStatus } from '@/hooks/useVipStatus';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { COIN_PACKAGES, type CoinPackage } from '@/types';
import { cn } from '@/lib/utils';

const PROCESSING_FEE = 0.50;
const MIN_COINS = 5;

interface SearchResult {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rank: number;
}

interface CoinsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoinsOverlay({ open, onOpenChange }: CoinsOverlayProps) {
  const { user, wallet, refreshWallet } = useAuth();
  const { isVip, sendTip } = useVipStatus();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('buy');
  
  // Buy coins state
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Tip state
  const [selectedRecipient, setSelectedRecipient] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [sendingTip, setSendingTip] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedPackage(null);
      setCustomAmount('');
      setSelectedRecipient(null);
      setSearchQuery('');
      setSearchResults([]);
      setTipAmount('');
    }
  }, [open]);

  // Search for users
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await (supabase.rpc as any)('search_players_public', {
          p_query: searchQuery.trim(),
          p_current_user_id: user?.id || null,
          p_limit: 8,
        });

        if (!error && data) {
          setSearchResults(data as SearchResult[]);
        }
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, user?.id]);

  // Buy coins calculations
  const finalAmount = customAmount ? parseFloat(customAmount) : (selectedPackage?.coins ?? 0);
  const finalPrice = finalAmount + PROCESSING_FEE;
  const isValidAmount = finalAmount >= MIN_COINS;

  // Tip calculations
  const numTipAmount = parseFloat(tipAmount) || 0;
  const maxTipAmount = Math.min(wallet?.balance ?? 0, 50);
  const isValidTipAmount = numTipAmount > 0 && numTipAmount <= maxTipAmount;

  const handleSelectPackage = (pkg: CoinPackage) => {
    setSelectedPackage(pkg);
    setCustomAmount('');
  };

  const handleCheckout = async () => {
    if (!user) return;
    if (!isValidAmount) {
      toast({
        title: 'Invalid amount',
        description: `Minimum purchase is ${MIN_COINS} Coins.`,
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
        title: 'Error',
        description: 'Unable to start payment. Try again.',
        variant: 'destructive',
      });
      setProcessing(false);
    }
  };

  const handleSendTip = async () => {
    if (!isValidTipAmount || !selectedRecipient) return;

    setSendingTip(true);
    const result = await sendTip(selectedRecipient.user_id, numTipAmount);
    
    if (result.success) {
      await refreshWallet();
      toast({
        title: 'Tip Sent! 💝',
        description: `You sent ${numTipAmount} coins to @${selectedRecipient.username}`,
      });
      setSelectedRecipient(null);
      setTipAmount('');
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to send tip',
        variant: 'destructive',
      });
    }
    
    setSendingTip(false);
  };

  const quickTipAmounts = [1, 5, 10, 25];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CoinIcon size="md" />
            Coins
          </DialogTitle>
          <DialogDescription>
            Buy coins or send tips to other players
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-12">
            <TabsTrigger 
              value="buy" 
              className="flex-1 gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Sparkles className="w-4 h-4" />
              Buy Coins
            </TabsTrigger>
            <TabsTrigger 
              value="tip" 
              className="flex-1 gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              disabled={!isVip}
            >
              <Gift className="w-4 h-4" />
              Send Tip
              {!isVip && <Lock className="w-3 h-3 ml-1" />}
            </TabsTrigger>
          </TabsList>

          {/* BUY COINS TAB */}
          <TabsContent value="buy" className="p-6 space-y-4 mt-0">
            {/* Quick packages */}
            <div className="grid grid-cols-3 gap-3">
              {COIN_PACKAGES.slice(0, 6).map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handleSelectPackage(pkg)}
                  className={cn(
                    "p-3 rounded-xl border-2 transition-all duration-200 text-center",
                    selectedPackage?.id === pkg.id
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(79,142,255,0.2)]"
                      : "border-border hover:border-primary/50 bg-secondary/30",
                    pkg.popular && "relative"
                  )}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-accent text-accent-foreground">
                      Popular
                    </Badge>
                  )}
                  <div className="flex justify-center mb-2">
                    <CoinIcon size="md" />
                  </div>
                  <p className="font-bold text-lg">{pkg.coins}</p>
                  <p className="text-xs text-muted-foreground">€{pkg.price}</p>
                  {selectedPackage?.id === pkg.id && (
                    <Check className="w-4 h-4 text-primary mx-auto mt-1" />
                  )}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Custom Amount (min €{MIN_COINS})</Label>
              <Input
                type="number"
                placeholder={`Enter amount...`}
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedPackage(null);
                }}
                min={MIN_COINS}
                step={1}
                className="bg-background/50"
              />
            </div>

            {/* Summary */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coins</span>
                <span>€{finalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  Fee <Info className="w-3 h-3" />
                </span>
                <span>€{PROCESSING_FEE.toFixed(2)}</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span>€{isValidAmount ? finalPrice.toFixed(2) : '0.00'}</span>
              </div>

              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground mb-1">You'll receive</p>
                <CoinDisplay amount={isValidAmount ? finalAmount : 0} size="lg" className="glow-text-gold" />
              </div>

              <Button
                className="w-full glow-blue btn-premium"
                onClick={handleCheckout}
                disabled={processing || !isValidAmount}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {processing ? 'Processing...' : 'Pay Now'}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>Secure payment via Stripe</span>
              </div>
            </div>
          </TabsContent>

          {/* SEND TIP TAB */}
          <TabsContent value="tip" className="p-6 space-y-4 mt-0">
            {!isVip ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-accent" />
                </div>
                <h3 className="font-semibold mb-2">VIP Required</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Unlock the ability to send tips by becoming a VIP member
                </p>
                <Badge variant="outline" className="text-accent border-accent">
                  VIP Feature
                </Badge>
              </div>
            ) : (
              <>
                {/* Recipient Selection */}
                {!selectedRecipient ? (
                  <div className="space-y-3">
                    <Label>Select Recipient</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search players..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-background/50"
                      />
                      {searching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    {searchResults.length > 0 && (
                      <ScrollArea className="max-h-48 border border-border rounded-xl">
                        {searchResults.map((player) => (
                          <button
                            key={player.user_id}
                            onClick={() => {
                              setSelectedRecipient(player);
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                          >
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={player.avatar_url ?? undefined} />
                              <AvatarFallback className="text-xs bg-primary/20 text-primary">
                                {player.username?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{player.username}</p>
                              <p className="text-xs text-muted-foreground">Rank #{player.rank}</p>
                            </div>
                          </button>
                        ))}
                      </ScrollArea>
                    )}

                    {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No players found
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Selected Recipient */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={selectedRecipient.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {selectedRecipient.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">@{selectedRecipient.username}</p>
                        <p className="text-xs text-muted-foreground">Recipient</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRecipient(null)}
                        className="text-muted-foreground"
                      >
                        Change
                      </Button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={tipAmount}
                        onChange={(e) => setTipAmount(e.target.value)}
                        min={1}
                        max={maxTipAmount}
                        step={0.01}
                        className="bg-background/50"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Max: {maxTipAmount.toFixed(2)} coins</span>
                        <span>Balance: <CoinDisplay amount={wallet?.balance ?? 0} size="sm" /></span>
                      </div>
                    </div>

                    {/* Quick Amounts */}
                    <div className="flex gap-2">
                      {quickTipAmounts.map((qa) => (
                        <Button
                          key={qa}
                          variant={numTipAmount === qa ? "default" : "outline"}
                          size="sm"
                          className="flex-1"
                          onClick={() => setTipAmount(String(qa))}
                          disabled={qa > maxTipAmount}
                        >
                          {qa}
                        </Button>
                      ))}
                    </div>

                    {/* Send Button */}
                    <Button 
                      onClick={handleSendTip}
                      disabled={!isValidTipAmount || sendingTip}
                      className="w-full glow-blue btn-premium"
                    >
                      {sendingTip ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {sendingTip ? 'Sending...' : `Send ${numTipAmount > 0 ? `${numTipAmount} Coins` : 'Tip'}`}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      Limit: 10 tips per day, max 50 coins per tip
                    </p>
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
