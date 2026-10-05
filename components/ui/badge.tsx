import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#800020] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#800020] text-white shadow-none hover:bg-[#600018]",
        secondary:
          "border-[#F0B8C4] bg-[#FFF0F3] text-[#800020] hover:bg-[#FCE0E6]",
        destructive:
          "border-transparent bg-[#9C0E2E] text-white shadow-none hover:bg-[#7A0822]",
        outline:
          "text-[#800020] border-[#800020] bg-white",
        live: "border-[#800020]/40 bg-[#FFF0F3] text-[#800020] font-semibold",
        processing:
          "border-[#BA193D]/40 bg-[#FFF5F7] text-[#BA193D] font-semibold",
        ready:
          "border-[#800020]/30 bg-[#FFF0F3] text-[#800020] font-semibold",
        failed:
          "border-[#9C0E2E]/40 bg-[#FFF0F3] text-[#9C0E2E] font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
