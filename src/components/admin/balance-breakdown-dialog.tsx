"use client";

import { useEffect, useState } from "react";
import { Search, Wallet } from "lucide-react";
import { UserProfileDialog } from "@/components/admin/user-profile-dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTK } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface BalanceRow {
  id: string;
  sky_id: string;
  full_name: string | null;
  email: string | null;
  balance: number;
  status: "active" | "suspended";
}

interface BalancesResponse {
  rows: BalanceRow[];
  count: number;
  sum: number;
}

export function BalanceBreakdownDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, error, isLoading } = useApi<BalancesResponse>(
    open
      ? `/api/admin/balances${
          search ? `?q=${encodeURIComponent(search)}` : ""
        }`
      : null,
    { refreshInterval: open ? 30000 : 0 }
  );

  const rows = data?.rows ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Wallet balances</DialogTitle>
            <DialogDescription>
              {data
                ? `${data.count} wallet${data.count === 1 ? "" : "s"} · ${formatTK(
                    data.sum
                  )} held`
                : "How much each account is holding, highest first."}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or sky ID"
              className="pl-9"
              aria-label="Search wallets"
            />
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
            {isLoading && !data ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            ) : error && !data ? (
              <EmptyState
                icon={Wallet}
                title="Could not load balances"
                description={error.message}
                className="py-8"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No matching wallets"
                description={
                  search
                    ? "Try a different name, email or sky ID."
                    : "No account is holding a balance right now."
                }
                className="py-8"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Status
                    </TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setUserId(row.id)}
                    >
                      <TableCell className="min-w-0">
                        <p className="font-mono text-xs font-medium">
                          {row.sky_id}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.full_name ?? row.email ?? "Unknown"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatTK(Number(row.balance))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Click a row to open that user&apos;s profile.
          </p>
        </DialogContent>
      </Dialog>

      <UserProfileDialog
        userId={userId}
        open={userId !== null}
        onOpenChange={(next) => {
          if (!next) setUserId(null);
        }}
      />
    </>
  );
}
