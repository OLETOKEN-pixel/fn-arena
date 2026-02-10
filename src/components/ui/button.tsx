import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-glow-blue",
        destructive: "bg-destructive/80 text-destructive-foreground hover:bg-destructive/70 hover:-translate-y-0.5 hover:shadow-glow-magenta",
        outline: "border border-white/[0.08] bg-transparent hover:bg-secondary hover:border-[rgba(0,255,255,0.2)] hover:text-foreground hover:shadow-[0_0_20px_rgba(0,255,255,0.06)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5",
        ghost: "hover:bg-secondary hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        gold: "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black font-bold hover:-translate-y-0.5 hover:shadow-glow-gold hover:from-amber-400 hover:via-yellow-400 hover:to-amber-300",
        premium: "relative overflow-hidden bg-[linear-gradient(135deg,rgba(0,255,255,0.15),rgba(255,0,255,0.10))] text-foreground border border-[rgba(0,255,255,0.18)] hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(0,255,255,0.12),0_0_34px_rgba(255,0,255,0.06)] hover:border-[rgba(255,0,255,0.18)]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-4 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
