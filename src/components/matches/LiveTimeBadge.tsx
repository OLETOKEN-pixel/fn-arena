import { useEffect, useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveTimeBadgeProps {
  createdAt: string;
  startedAt?: string | null;
  status: string;
  className?: string;
}

export function LiveTimeBadge({ createdAt, startedAt, status, className }: LiveTimeBadgeProps) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      const referenceTime = startedAt && (status === 'started' || status === 'full') 
        ? new Date(startedAt) 
        : new Date(createdAt);
      
      const now = new Date();
      const diffMs = now.getTime() - referenceTime.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        setElapsed(`${diffDays}g ${diffHours % 24}h`);
      } else if (diffHours > 0) {
        setElapsed(`${diffHours}h ${diffMinutes % 60}m`);
      } else {
        setElapsed(`${diffMinutes}m`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [createdAt, startedAt, status]);

  const isInProgress = status === 'started' || status === 'full';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        isInProgress 
          ? 'bg-success/20 text-success animate-pulse' 
          : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {isInProgress ? (
        <>
          <Zap className="w-3 h-3" />
          <span>LIVE • {elapsed}</span>
        </>
      ) : (
        <>
          <Clock className="w-3 h-3" />
          <span>Aperto da {elapsed}</span>
        </>
      )}
    </div>
  );
}
