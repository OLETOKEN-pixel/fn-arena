import { useState } from 'react';
import { Crown, Gift, User, Check, Coins, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useVipStatus } from '@/hooks/useVipStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { CoinDisplay } from '@/components/common/CoinDisplay';
import { cn } from '@/lib/utils';

interface VipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIP_COST = 5;

export function VipModal({ open, onOpenChange }: VipModalProps) {
  const { isVip, daysRemaining, expiresAt, purchaseVip, loading } = useVipStatus();
  const { wallet, refreshWallet, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [purchasing, setPurchasing] = useState(false);

  const canAfford = (wallet?.balance ?? 0) >= VIP_COST;

  const handlePurchase = async () => {
    if (!user) {
      navigate('/auth');
      onOpenChange(false);
      return;
    }

    if (!canAfford) {
      navigate('/buy');
      onOpenChange(false);
      return;
    }

    setPurchasing(true);
    const result = await purchaseVip();
    
    if (result.success) {
      await refreshWallet();
      toast({
        title: 'VIP Activated! 🎉',
        description: 'You now have access to exclusive VIP features for 30 days.',
      });
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to purchase VIP',
        variant: 'destructive',
      });
    }
    
    setPurchasing(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const benefits = [
    {
      icon: Gift,
      title: 'Send Tips',
      description: 'Send coins to other players',
    },
    {
      icon: User,
      title: 'Change Username',
      description: 'Free username changes anytime',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="w-6 h-6 text-amber-400" />
            VIP Membership
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status */}
          <div className={cn(
            "p-4 rounded-lg border",
            isVip 
              ? "bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border-amber-500/30"
              : "bg-muted/30 border-border"
          )}>
            {isVip ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="font-semibold text-green-400">Active</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Expires {expiresAt ? formatDate(expiresAt) : 'N/A'} ({daysRemaining} days remaining)
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <X className="w-5 h-5 text-muted-foreground" />
                  <span className="font-semibold text-muted-foreground">Not Active</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Unlock exclusive features for 30 days
                </p>
              </div>
            )}
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Benefits</h4>
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="p-2 rounded-md bg-amber-500/10">
                  <benefit.icon className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">{benefit.title}</p>
                  <p className="text-xs text-muted-foreground">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Purchase Button */}
          <div className="pt-2">
            {isVip ? (
              <Button 
                onClick={handlePurchase}
                disabled={purchasing || loading || !canAfford}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-semibold"
              >
                {purchasing ? (
                  'Extending...'
                ) : (
                  <>
                    <Coins className="w-4 h-4 mr-2" />
                    Extend VIP – 
                    <CoinDisplay amount={VIP_COST} size="sm" className="ml-1" showIcon={false} />
                  </>
                )}
              </Button>
            ) : canAfford ? (
              <Button 
                onClick={handlePurchase}
                disabled={purchasing || loading}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-semibold"
              >
                {purchasing ? (
                  'Activating...'
                ) : (
                  <>
                    <Crown className="w-4 h-4 mr-2" />
                    Activate VIP – 
                    <CoinDisplay amount={VIP_COST} size="sm" className="ml-1" showIcon={false} />
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={() => {
                  navigate('/buy');
                  onOpenChange(false);
                }}
                variant="outline"
                className="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              >
                <Coins className="w-4 h-4 mr-2" />
                Buy Coins to Unlock VIP
              </Button>
            )}
          </div>

          {/* Balance indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Your balance:</span>
            <CoinDisplay amount={wallet?.balance ?? 0} size="sm" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
