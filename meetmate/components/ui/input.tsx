import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#D7CCC8] bg-white px-3 py-2 text-sm text-[#2A1B18] ring-offset-white placeholder:text-[#9C8A83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4A3730] dark:bg-[#201512] dark:text-[#F5EFEB] dark:placeholder:text-[#8D766E] dark:ring-offset-[#18110E] dark:focus-visible:ring-[#A64B5C]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
