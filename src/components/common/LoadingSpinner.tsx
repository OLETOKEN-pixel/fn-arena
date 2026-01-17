import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div className={cn(
      'animate-spin rounded-full border-2 border-primary border-t-transparent',
      size === 'sm' && 'w-4 h-4',
      size === 'md' && 'w-8 h-8',
      size === 'lg' && 'w-12 h-12',
      className
    )} />
  );
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
