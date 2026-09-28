import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-base font-semibold tracking-tight",
        className
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Cloud className="size-4" />
      </span>
      <span>
        Skyzone <span className="text-primary">IT</span>
      </span>
    </span>
  );
}
