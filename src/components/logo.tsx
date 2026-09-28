import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className="inline-flex items-center dark:rounded-lg dark:bg-white dark:p-1.5">
      <Image
        src="/logo.png"
        alt="Skyzone IT"
        width={865}
        height={289}
        priority
        className={cn("h-7 w-auto select-none", className)}
      />
    </span>
  );
}
