import { Users, User, Coins, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PaymentMode, TeamMemberWithBalance } from '@/types';

interface PaymentModeSelectorProps {
  paymentMode: PaymentMode;
  onChangePaymentMode: (mode: PaymentMode) => void;
  entryFee: number;
  teamSize: number;
  memberBalances?: TeamMemberWithBalance[];
  userBalance?: number;
}

export function PaymentModeSelector({
  paymentMode,
  onChangePaymentMode,
  entryFee,
  teamSize,
  memberBalances,
  userBalance = 0,
}: PaymentModeSelectorProps) {
  const totalCost = entryFee * teamSize;
  const canCover = userBalance >= totalCost;
  
  const insufficientMembers = memberBalances?.filter(m => m.balance < entryFee) ?? [];
  const canSplit = insufficientMembers.length === 0;

  return (
    <div className="space-y-3">
      {/* Cover All Option */}
      <Card
        className={cn(
          "cursor-pointer transition-all border-2",
          paymentMode === 'cover'
            ? "border-primary bg-primary/5"
            : "border-transparent hover:border-primary/50",
          !canCover && paymentMode !== 'cover' && "opacity-60"
        )}
        onClick={() => onChangePaymentMode('cover')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">Cover All</h4>
                <p className="text-sm text-muted-foreground">
                  You pay for the entire team
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-lg font-bold">
                <Coins className="w-4 h-4 text-accent" />
                {totalCost}
              </div>
              <p className="text-xs text-muted-foreground">total</p>
            </div>
          </div>
          
          {!canCover && (
            <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>You need {totalCost} Coins (have {userBalance.toFixed(2)})</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Split Pay Option */}
      <Card
        className={cn(
          "cursor-pointer transition-all border-2",
          paymentMode === 'split'
            ? "border-primary bg-primary/5"
            : "border-transparent hover:border-primary/50",
          !canSplit && paymentMode !== 'split' && "opacity-60"
        )}
        onClick={() => canSplit && onChangePaymentMode('split')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h4 className="font-semibold">Split Pay</h4>
                <p className="text-sm text-muted-foreground">
                  Each member pays their share
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-lg font-bold">
                <Coins className="w-4 h-4 text-accent" />
                {entryFee}
              </div>
              <p className="text-xs text-muted-foreground">each</p>
            </div>
          </div>

          {!canSplit && insufficientMembers.length > 0 && (
            <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>
                  Insufficient balance: {insufficientMembers.map(m => m.username).join(', ')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
