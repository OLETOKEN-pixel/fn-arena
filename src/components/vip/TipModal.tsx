import { useState, useEffect, useRef } from 'react';
import { Gift, Send, AlertCircle, Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVipStatus } from '@/hooks/useVipStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientUsername: string;
  recipientAvatarUrl?: string;
}

interface SearchResult {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rank: number;
}

export function TipModal({ 
  open, 
  onOpenChange, 
  recipientId, 
  recipientUsername, 
  recipientAvatarUrl 
}: TipModalProps) {
  const { isVip, sendTip } = useVipStatus();
  const { user, wallet, refreshWallet } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  
  // User selection state (when no recipient is pre-selected)
  const [selectedRecipient, setSelectedRecipient] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setAmount('');
      setSearchQuery('');
      setSearchResults([]);
      // If recipient is pre-selected, use it
      if (recipientId && recipientUsername) {
        setSelectedRecipient({
          user_id: recipientId,
          username: recipientUsername,
          avatar_url: recipientAvatarUrl ?? null,
          rank: 0,
        });
      } else {
        setSelectedRecipient(null);
      }
    }
  }, [open, recipientId, recipientUsername, recipientAvatarUrl]);

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

  const numAmount = parseFloat(amount) || 0;
  const maxAmount = Math.min(wallet?.balance ?? 0, 50);
  const isValidAmount = numAmount > 0 && numAmount <= maxAmount;
  const hasRecipient = selectedRecipient !== null;

  const handleSend = async () => {
    if (!isValidAmount || !selectedRecipient) return;

    setSending(true);
    const result = await sendTip(selectedRecipient.user_id, numAmount);
    
    if (result.success) {
      await refreshWallet();
      toast({
        title: 'Tip Sent! 💝',
        description: `You sent ${numAmount} coins to @${selectedRecipient.username}`,
      });
      onOpenChange(false);
      setAmount('');
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to send tip',
        variant: 'destructive',
      });
    }
    
    setSending(false);
  };

  const quickAmounts = [1, 5, 10, 25];

  if (!isVip) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-400" />
              Send Tip
            </DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              VIP membership required to send tips. Upgrade to VIP to unlock this feature!
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-400" />
            Send Tip
          </DialogTitle>
          <DialogDescription>
            Send coins to another player
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient Selection */}
          {!hasRecipient ? (
            <div className="space-y-2">
              <Label>Select Recipient</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {searchResults.length > 0 && (
                <ScrollArea className="max-h-48 border border-border rounded-lg">
                  {searchResults.map((player) => (
                    <button
                      key={player.user_id}
                      onClick={() => {
                        setSelectedRecipient(player);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left',
                        'hover:bg-secondary/50 transition-colors'
                      )}
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
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
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
                {!recipientId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRecipient(null)}
                    className="text-muted-foreground"
                  >
                    Change
                  </Button>
                )}
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={1}
                  max={maxAmount}
                  step={0.01}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Max: {maxAmount.toFixed(2)} coins</span>
                  <span>Balance: <CoinDisplay amount={wallet?.balance ?? 0} size="sm" /></span>
                </div>
              </div>

              {/* Quick Amounts */}
              <div className="flex gap-2">
                {quickAmounts.map((qa) => (
                  <Button
                    key={qa}
                    variant={numAmount === qa ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setAmount(String(qa))}
                    disabled={qa > maxAmount}
                  >
                    {qa}
                  </Button>
                ))}
              </div>

              {/* Send Button */}
              <Button 
                onClick={handleSend}
                disabled={!isValidAmount || sending}
                className="w-full"
              >
                {sending ? (
                  'Sending...'
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send {numAmount > 0 ? `${numAmount} Coins` : 'Tip'}
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Limit: 10 tips per day, max 50 coins per tip
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
