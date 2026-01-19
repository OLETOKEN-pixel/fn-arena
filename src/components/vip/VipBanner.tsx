import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVipStatus } from '@/hooks/useVipStatus';

interface VipBannerProps {
  onClick: () => void;
  className?: string;
}

export function VipBanner({ onClick, className }: VipBannerProps) {
  const { isVip, daysRemaining, loading } = useVipStatus();

  if (loading) {
    return (
      <button
        className={cn(
          "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
          "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30",
          "hover:from-amber-500/30 hover:to-yellow-500/30 transition-all duration-200",
          "animate-pulse",
          className
        )}
        disabled
      >
        <Crown className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">...</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
        "transition-all duration-200 cursor-pointer",
        isVip 
          ? "bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border border-amber-400/50 hover:border-amber-400/70 hover:shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          : "bg-secondary/50 border border-border hover:bg-secondary hover:border-amber-500/30",
        className
      )}
    >
      <Crown className={cn(
        "w-4 h-4",
        isVip ? "text-amber-400" : "text-muted-foreground"
      )} />
      <span className={cn(
        "text-sm font-medium",
        isVip ? "text-amber-300" : "text-muted-foreground"
      )}>
        {isVip ? `VIP (${daysRemaining}d)` : 'VIP'}
      </span>
    </button>
  );
}
