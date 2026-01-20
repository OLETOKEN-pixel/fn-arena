import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClaimButtonProps {
  onClick: () => Promise<void>;
  isLoading: boolean;
}

export const ClaimButton = memo(function ClaimButton({
  onClick,
  isLoading,
}: ClaimButtonProps) {
  const [isClicking, setIsClicking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleClick = async () => {
    if (isLoading || isClicking) return;
    
    setIsClicking(true);
    try {
      await onClick();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } finally {
      setIsClicking(false);
    }
  };

  const loading = isLoading || isClicking;

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'relative overflow-hidden font-semibold transition-all duration-300',
        'bg-gradient-to-r from-accent to-accent/80',
        'hover:from-accent/90 hover:to-accent/70',
        'shadow-[0_0_15px_-3px_hsl(var(--accent)/0.5)]',
        showSuccess && 'bg-green-500 from-green-500 to-green-600'
      )}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          <span>Claiming...</span>
        </>
      ) : showSuccess ? (
        <span>Claimed!</span>
      ) : (
        <>
          <Gift className="w-3.5 h-3.5 mr-1.5" />
          <span>Claim</span>
        </>
      )}
      
      {/* Shimmer effect */}
      {!loading && !showSuccess && (
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      )}
    </Button>
  );
});
