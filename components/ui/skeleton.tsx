import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[#FFF0F3] border border-[#F0B8C4]/40",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
