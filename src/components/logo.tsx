import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-base font-bold tracking-tight",
        className
      )}
    >
      <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-lg text-white shadow-[0_4px_12px_-4px_oklch(0.585_0.163_237.323_/_0.6)]">
        <Cloud className="size-4" />
      </span>
      <span>
        Skyzone <span className="text-gradient-brand">IT</span>
      </span>
    </span>
  );
}
