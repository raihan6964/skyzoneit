import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  active:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  inactive: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
  suspended:
    "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled:
    "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
  admin: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  user: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      className={cn(
        "font-medium capitalize",
        STYLES[status] ?? STYLES.inactive,
        className
      )}
    >
      {LABELS[status] ?? status}
    </Badge>
  );
}
