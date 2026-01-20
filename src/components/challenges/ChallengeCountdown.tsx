import { memo, useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChallengeCountdownProps {
  targetDate: Date;
  label: string;
  className?: string;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0m';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

export const ChallengeCountdown = memo(function ChallengeCountdown({
  targetDate,
  label,
  className,
}: ChallengeCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => targetDate.getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(targetDate.getTime() - Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Clock className="w-3.5 h-3.5" />
      <span>{label}:</span>
      <span className="font-mono font-medium text-foreground">
        {formatTimeLeft(timeLeft)}
      </span>
    </div>
  );
});
