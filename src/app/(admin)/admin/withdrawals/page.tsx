"use client";

import { useState } from "react";
import { mutate } from "swr";
import {
  Banknote,
  Copy,
  Loader2,
  CircleX,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatTK } from "@/lib/format";
import { postJson, useApi } from "@/lib/hooks";
import type { Withdrawal, WithdrawalStatus } from "@/lib/types";

const PAGE_SIZE = 25;

type StatusFilter = "all" | WithdrawalStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  pending: "Pending",
  paid: "Paid",
  cancelled: "Cancelled",
};

const ACTION_COPY: Record<
  "paid" | "cancelled",
  { title: string; description: string; action: string }
> = {
  paid: {
    title: "Mark as paid?",
    description:
      "Confirm you have sent this amount to the worker's bKash number. The request is then closed.",
    action: "Mark paid",
  },
  cancelled: {
    title: "Cancel this request?",
    description:
      "The requested amount will be refunded back to the worker's balance. This cannot be undone.",
    action: "Cancel request",
  },
};

export default function AdminWithdrawalsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{
    id: string;
    status: "paid" | "cancelled";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const url = `/api/admin/withdrawals?status=${encodeURIComponent(
    status
  )}&page=${page}&page_size=${PAGE_SIZE}`;

  const { data, error, isLoading, mutate: refresh } = useApi<{
    withdrawals: Withdrawal[];
    total: number;
    page: number;
    page_size: number;
  }>(url);

  const refreshAll = () => {
    void refresh();
    void mutate(() => true);
  };

  const copyNumber = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("bKash number copied");
    } catch {
      toast.error("Could not copy the bKash number");
    }
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await postJson(
        `/api/admin/withdrawals/${action.id}`,
        {
          status: action.status,
        },
        "PATCH"
      );
      toast.success(
        action.status === "paid"
          ? "Withdrawal marked as paid"
          : "Withdrawal cancelled and balance refunded"
      );
      setAction(null);
      refreshAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update withdrawal"
      );
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.withdrawals ?? [];
  const total = data?.total ?? 0;
  const actionCopy = action ? ACTION_COPY[action.status] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Withdrawals</h1>
          <p className="text-sm text-muted-foreground">
            Pay out bKash requests and keep the ledger balanced
          </p>
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            if (
              value === "all" ||
              value === "pending" ||
              value === "paid" ||
              value === "cancelled"
            ) {
              setStatus(value);
              setPage(1);
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            {STATUS_LABELS[status]}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead>User</TableHead>
              <TableHead>bKash number</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 6 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error && !data ? (
              <TableRow>
                <TableCell colSpan={6} className="whitespace-normal">
                  <EmptyState
                    icon={Banknote}
                    title="Could not load withdrawals"
                    description={error.message}
                  />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="whitespace-normal">
                  <EmptyState
                    icon={Banknote}
                    title="No withdrawal requests"
                    description={
                      status === "pending"
                        ? "All caught up — no pending payouts right now."
                        : "Payout requests will show up here."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-xs font-medium">
                      {row.profile?.sky_id ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.profile?.full_name ?? "Unknown"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-sm">
                        {row.bkash_number}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Copy bKash number"
                              onClick={() => void copyNumber(row.bkash_number)}
                            />
                          }
                        >
                          <Copy />
                        </TooltipTrigger>
                        <TooltipContent>Copy number</TooltipContent>
                      </Tooltip>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatTK(row.amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "pending" ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          disabled={busy}
                          onClick={() => setAction({ id: row.id, status: "paid" })}
                        >
                          Mark paid
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            setAction({ id: row.id, status: "cancelled" })
                          }
                        >
                          <CircleX />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                        <span>
                          {row.status === "paid" ? "Processed" : "Refunded"}
                        </span>
                        <span className="hidden sm:inline">
                          {formatDateTime(row.processed_at)}
                        </span>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!error && total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}

      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant={action?.status === "cancelled" ? "destructive" : "default"}
              onClick={runAction}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {actionCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
