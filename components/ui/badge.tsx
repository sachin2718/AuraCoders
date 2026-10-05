import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#722F37] text-white shadow-none hover:bg-[#5A1827]",
        secondary:
          "border-transparent bg-[#EFE8E1] text-[#4A3026] hover:bg-[#E5DCD2] dark:bg-[#2F211C] dark:text-[#EFE8E1]",
        destructive:
          "border-transparent bg-[#8B2635] text-white shadow-none hover:bg-[#721F2B]",
        outline:
          "text-[#2A1B18] border-[#D7CCC8] bg-white dark:text-[#F5EFEB] dark:border-[#4A3730] dark:bg-[#201512]",
        live: "border-[#7A4B3A]/30 bg-[#F5ECE5] text-[#7A4B3A] dark:bg-[#322019] dark:text-[#D4A392] dark:border-[#7A4B3A]/50",
        processing:
          "border-[#8C5824]/30 bg-[#FAF2E6] text-[#8C5824] dark:bg-[#342414] dark:text-[#DEAC78] dark:border-[#8C5824]/50",
        ready:
          "border-[#722F37]/30 bg-[#FAF0F2] text-[#722F37] dark:bg-[#3A1B22] dark:text-[#E8A2B0] dark:border-[#722F37]/50",
        failed:
          "border-[#8A2525]/30 bg-[#FDF0F0] text-[#8A2525] dark:bg-[#381B1B] dark:text-[#E69393]",
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
