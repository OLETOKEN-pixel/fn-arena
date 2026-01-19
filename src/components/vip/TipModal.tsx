import { useState } from 'react';
import { Gift, Send, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useVipStatus } from '@/hooks/useVipStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CoinDisplay } from '@/components/common/CoinDisplay';

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientUsername: string;
  recipientAvatarUrl?: string;
}

export function TipModal({ 
  open, 
  onOpenChange, 
  recipientId, 
  recipientUsername, 
  recipientAvatarUrl 
}: TipModalProps) {
  const { isVip, sendTip } = useVipStatus();
  const { wallet, refreshWallet } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const maxAmount = Math.min(wallet?.balance ?? 0, 50);
  const isValidAmount = numAmount > 0 && numAmount <= maxAmount;

  const handleSend = async () => {
    if (!isValidAmount) return;

    setSending(true);
    const result = await sendTip(recipientId, numAmount);
    
    if (result.success) {
      await refreshWallet();
      toast({
        title: 'Tip Sent! 💝',
        description: `You sent ${numAmount} coins to @${recipientUsername}`,
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
          {/* Recipient */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <Avatar className="w-10 h-10">
              <AvatarImage src={recipientAvatarUrl} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {recipientUsername.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">@{recipientUsername}</p>
              <p className="text-xs text-muted-foreground">Recipient</p>
            </div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
