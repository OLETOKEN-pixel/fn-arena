import coinIcon from '@/assets/coin-icon.png';
import { cn } from '@/lib/utils';

const sizeMap = {
  xs: 'w-4 h-4',      // 16px
  sm: 'w-5 h-5',      // 20px
  md: 'w-6 h-6',      // 24px
  lg: 'w-8 h-8',      // 32px
  xl: 'w-10 h-10',    // 40px
  hero: 'w-20 h-20 lg:w-28 lg:h-28', // 80px / 112px
} as const;

interface CoinIconProps {
  size?: keyof typeof sizeMap;
  className?: string;
}

export function CoinIcon({ size = 'md', className }: CoinIconProps) {
  return (
    <img
      src={coinIcon}
      alt="Coin"
      className={cn(
        sizeMap[size],
        'object-contain flex-shrink-0',
        className
      )}
      draggable={false}
    />
  );
}
