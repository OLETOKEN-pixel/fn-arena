import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CoinDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function CoinDisplay({ 
  amount, 
  size = 'md', 
  showIcon = true,
  className 
}: CoinDisplayProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 font-semibold text-accent',
      size === 'sm' && 'text-sm',
      size === 'md' && 'text-base',
      size === 'lg' && 'text-xl',
      className
    )}>
      {showIcon && (
        <Coins className={cn(
          size === 'sm' && 'w-3.5 h-3.5',
          size === 'md' && 'w-4 h-4',
          size === 'lg' && 'w-5 h-5'
        )} />
      )}
      <span>{amount.toFixed(2)}</span>
    </span>
  );
}
