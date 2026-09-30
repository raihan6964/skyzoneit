"use client";

import { useState } from "react";
import Image from "next/image";
import { History, Receipt } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import type { SubmissionWithMeta } from "@/lib/types";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export default function HistoryPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [viewer, setViewer] = useState<SubmissionWithMeta | null>(null);

  const { data, isLoading } = useApi<{ submissions: SubmissionWithMeta[] }>(
    "/api/user/submissions"
  );

  const submissions = (data?.submissions ?? []).filter(
    (row) => filter === "all" || row.status === filter
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Submission history
        </h1>
        <p className="text-sm text-muted-foreground">
          Track the status of everything you&apos;ve submitted.
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === item.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing here yet"
          description="Your submissions will appear here once you complete a task."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">Shot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.task?.app_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{row.reviewer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.reviewer_gmail || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(row.submitted_at)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatTK(row.reward)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                      {row.status === "rejected" && row.rejection_reason && (
                        <p className="mt-1 max-w-40 text-xs text-muted-foreground">
                          {row.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setViewer(row)}
                        className="relative size-10 overflow-hidden rounded-md border"
                        aria-label="View screenshot"
                      >
                        <Image
                          src={row.screenshot_url}
                          alt="Screenshot"
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {submissions.map((row) => (
              <div key={row.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {row.task?.app_name ?? "App"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.reviewer_name}
                      {row.reviewer_gmail ? ` · ${row.reviewer_gmail}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(row.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    {formatTK(row.reward)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewer(row)}
                  >
                    View screenshot
                  </Button>
                </div>
                {row.status === "rejected" && row.rejection_reason && (
                  <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {row.rejection_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!viewer} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-4" />
            {viewer?.task?.app_name ?? "Screenshot"}
          </DialogTitle>
          {viewer && (
            <div className="relative overflow-hidden rounded-lg bg-muted">
              <Image
                src={viewer.screenshot_url}
                alt="Review screenshot"
                width={800}
                height={1200}
                className="mx-auto max-h-[70vh] w-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
