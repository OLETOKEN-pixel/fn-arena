import { cn } from '@/lib/utils';
import type { MatchStatus, Region, Platform, GameMode } from '@/types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'sm',
  className 
}: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center font-medium rounded-full',
      size === 'sm' && 'px-2 py-0.5 text-xs',
      size === 'md' && 'px-3 py-1 text-sm',
      variant === 'default' && 'bg-secondary text-secondary-foreground',
      variant === 'primary' && 'bg-primary/20 text-primary',
      variant === 'accent' && 'bg-accent/20 text-accent',
      variant === 'success' && 'bg-success/20 text-success',
      variant === 'warning' && 'bg-warning/20 text-warning',
      variant === 'destructive' && 'bg-destructive/20 text-destructive',
      variant === 'outline' && 'border border-border text-muted-foreground',
      className
    )}>
      {children}
    </span>
  );
}

// Match Status Badge
const statusVariants: Record<MatchStatus, BadgeProps['variant']> = {
  open: 'success',
  ready_check: 'warning',
  in_progress: 'primary',
  result_pending: 'warning',
  completed: 'success',
  disputed: 'destructive',
  canceled: 'default',
  admin_resolved: 'success',
  // Legacy states
  joined: 'warning',
  full: 'warning',
  started: 'primary',
  finished: 'default',
  expired: 'default',
};

const statusLabels: Record<MatchStatus, string> = {
  open: 'OPEN',
  ready_check: 'READY CHECK',
  in_progress: 'IN PROGRESS',
  result_pending: 'AWAITING RESULT',
  completed: 'COMPLETED',
  disputed: 'DISPUTED',
  canceled: 'CANCELED',
  admin_resolved: 'RESOLVED',
  // Legacy states
  joined: 'JOINED',
  full: 'FULL',
  started: 'LIVE',
  finished: 'FINISHED',
  expired: 'EXPIRED',
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <Badge variant={statusVariants[status]} className={cn(
      status === 'started' && 'pulse-live'
    )}>
      {statusLabels[status]}
    </Badge>
  );
}

// Region Badge
export function RegionBadge({ region }: { region: Region }) {
  return (
    <Badge variant="outline">
      {region}
    </Badge>
  );
}

// Platform Badge
const platformIcons: Record<Platform, string> = {
  PC: '🖥️',
  Console: '🎮',
  Mobile: '📱',
  All: '🌐',
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <Badge variant="outline">
      {platformIcons[platform]} {platform}
    </Badge>
  );
}

// Mode Badge
export function ModeBadge({ mode }: { mode: GameMode }) {
  return (
    <Badge variant="primary">
      {mode}
    </Badge>
  );
}
