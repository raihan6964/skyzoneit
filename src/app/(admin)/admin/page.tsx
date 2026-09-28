"use client";

import { mutate } from "swr";
import {
  BadgeCheck,
  Banknote,
  ClipboardCheck,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SubmissionsChart } from "@/components/admin/submissions-chart";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatTK } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CrmStats } from "@/lib/types";

interface RecentItem {
  id: string;
  submitted_at: string;
  status: string;
  reviewer_name: string;
  task: { app_name: string } | null;
  profile: { sky_id: string; full_name: string | null } | null;
}

interface StatsResponse {
  stats: CrmStats;
  chart: { date: string; pending: number; approved: number; rejected: number }[];
  recent: RecentItem[];
}

export default function AdminDashboardPage() {
  const { data, error, isLoading, isValidating } =
    useApi<StatsResponse>("/api/admin/stats", { refreshInterval: 15000 });

  const stats = data?.stats;

  const cards = [
    {
      label: "Total System Balance",
      value: stats ? formatTK(stats.system_balance) : "—",
      note: "Held across all worker wallets",
      icon: Wallet,
      highlight: true,
    },
    {
      label: "Total Users",
      value: stats ? stats.total_users.toLocaleString("en-US") : "—",
      note: stats ? `${stats.active_users} active accounts` : "Active accounts",
      icon: Users,
    },
    {
      label: "Pending Submissions",
      value: stats ? stats.pending_submissions.toLocaleString("en-US") : "—",
      note: stats
        ? `${stats.rejected_submissions} rejected all time`
        : "Rejected all time",
      icon: ClipboardCheck,
    },
    {
      label: "Approved Submissions",
      value: stats ? stats.approved_submissions.toLocaleString("en-US") : "—",
      note: "Credited to worker balances",
      icon: BadgeCheck,
    },
    {
      label: "Active Tasks",
      value: stats ? stats.active_tasks.toLocaleString("en-US") : "—",
      note: "Currently accepting submissions",
      icon: LayoutGrid,
    },
    {
      label: "Pending Withdrawals",
      value: stats ? stats.pending_withdrawals.toLocaleString("en-US") : "—",
      note: stats ? `${stats.paid_withdrawals} paid out` : "Paid out",
      icon: Banknote,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live CRM overview of Skyzone IT — refreshes every 15 seconds
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void mutate(() => true);
          }}
          disabled={isValidating}
        >
          {isValidating ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-4.5" />
              </span>
              <span className="text-xs text-muted-foreground">{card.note}</span>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
              {isLoading && !stats ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <span className={card.highlight ? "text-primary" : undefined}>
                  {card.value}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Submissions — last 14 days</h2>
            <p className="text-sm text-muted-foreground">
              Daily split of pending, approved and rejected reviews
            </p>
          </div>
        </div>
        {isLoading && !data ? (
          <Skeleton className="h-[280px] w-full rounded-lg" />
        ) : (
          <SubmissionsChart data={data?.chart ?? []} />
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent submissions</h2>
          <span className="text-xs text-muted-foreground">Latest 8 entries</span>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead>App</TableHead>
                <TableHead className="hidden sm:table-cell">User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 5 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error && !data ? (
                <TableRow>
                  <TableCell colSpan={5} className="whitespace-normal">
                    <EmptyState
                      icon={ClipboardCheck}
                      title="Could not load stats"
                      description={error.message}
                    />
                  </TableCell>
                </TableRow>
              ) : (data?.recent.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="whitespace-normal">
                    <EmptyState
                      icon={ClipboardCheck}
                      title="No submissions yet"
                      description="Approved and pending reviews will appear here."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                (data?.recent ?? []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.reviewer_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.task?.app_name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {item.profile?.sky_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(item.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
