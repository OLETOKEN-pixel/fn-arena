import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-[rgba(0,255,255,0.2)] bg-[rgba(0,255,255,0.1)] text-primary hover:bg-[rgba(0,255,255,0.15)]",
        secondary: "border-white/[0.08] bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-[rgba(255,0,255,0.2)] bg-[rgba(255,0,255,0.1)] text-destructive hover:bg-[rgba(255,0,255,0.15)]",
        outline: "text-foreground border-white/[0.08]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
