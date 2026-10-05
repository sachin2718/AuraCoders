import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#800020] text-white shadow-sm hover:bg-[#600018] active:scale-[0.98]",
        destructive:
          "bg-[#9C0E2E] text-white shadow-sm hover:bg-[#7A0822] active:scale-[0.98]",
        outline:
          "border-2 border-[#800020] bg-white text-[#800020] shadow-sm hover:bg-[#FFF0F3] active:scale-[0.98]",
        secondary:
          "bg-[#FFF0F3] text-[#800020] border border-[#F0B8C4] shadow-sm hover:bg-[#FCE0E6] active:scale-[0.98]",
        ghost:
          "text-[#800020] hover:bg-[#FFF0F3] hover:text-[#600018]",
        link: "text-[#800020] underline-offset-4 hover:underline hover:text-[#600018]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
