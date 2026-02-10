import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[14px] border border-white/[0.08] bg-[rgba(15,15,35,0.45)] px-4 py-2 text-base ring-offset-background transition-all duration-200",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/70",
          "hover:border-[rgba(0,255,255,0.15)] hover:bg-[rgba(15,15,35,0.55)]",
          "focus-visible:outline-none focus-visible:border-[rgba(0,255,255,0.25)] focus-visible:shadow-[0_0_0_4px_rgba(0,255,255,0.08),0_0_30px_rgba(255,0,255,0.06)] focus-visible:ring-0 focus-visible:bg-[rgba(15,15,35,0.55)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
