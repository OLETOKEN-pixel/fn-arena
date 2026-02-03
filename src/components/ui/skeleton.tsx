import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "rounded-lg bg-muted skeleton-premium",
        className
      )} 
      {...props} 
    />
  );
}

export { Skeleton };
