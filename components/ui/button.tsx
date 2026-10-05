import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#722F37] text-white shadow-sm hover:bg-[#5A1827] active:scale-[0.98] dark:bg-[#722F37] dark:hover:bg-[#5A1827]",
        destructive:
          "bg-[#8B2635] text-white shadow-sm hover:bg-[#721F2B] active:scale-[0.98]",
        outline:
          "border border-[#D7CCC8] bg-white text-[#2C1810] shadow-sm hover:bg-[#FAF8F5] active:scale-[0.98] dark:border-[#4A3730] dark:bg-[#231815] dark:text-[#F5EFEB] dark:hover:bg-[#2C1E1A]",
        secondary:
          "bg-[#EFE8E1] text-[#2C1810] shadow-sm hover:bg-[#E2D8CF] active:scale-[0.98] dark:bg-[#2F211C] dark:text-[#EFE8E1] dark:hover:bg-[#3D2C25]",
        ghost:
          "text-[#2C1810] hover:bg-[#EFE8E1] hover:text-[#2C1810] dark:text-[#EFE8E1] dark:hover:bg-[#2F211C]",
        link: "text-[#722F37] underline-offset-4 hover:underline dark:text-[#C97A8B]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8 text-base",
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
