"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { ScreenshotDialog } from "@/components/admin/screenshot-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatTK } from "@/lib/format";
import { postJson, useApi } from "@/lib/hooks";
import type { SubmissionStatus, Task, SubmissionWithMeta } from "@/lib/types";

const PAGE_SIZE = 25;

type StatusFilter = "all" | SubmissionStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function AdminSubmissionsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [shot, setShot] = useState<{ url: string; caption: string } | null>(
    null
  );
  const [rejectState, setRejectState] = useState<
    { ids: string[]; bulk: boolean } | null
  >(null);
  const [reverseState, setReverseState] = useState<
    { ids: string[]; bulk: boolean } | null
  >(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const url = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (status !== "all") params.set("status", status);
    if (taskId) params.set("task_id", taskId);
    if (date) params.set("date", date);
    if (search) params.set("q", search);
    return `/api/admin/submissions?${params.toString()}`;
  }, [status, taskId, date, search, page]);

  const { data, error, isLoading, isValidating, mutate: refresh } = useApi<{
    submissions: SubmissionWithMeta[];
    total: number;
    page: number;
    page_size: number;
  }>(url);

  const { data: taskData } = useApi<{ tasks: Task[] }>("/api/admin/tasks");

  const resetSelection = () => setSelected(new Set());

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    resetSelection();
  };

  const refreshAll = () => {
    void refresh();
  };

  const toggleBulkMode = () => {
    setBulkMode((prev) => {
      if (prev) resetSelection();
      return !prev;
    });
  };

  const rows = data?.submissions ?? [];
  const total = data?.total ?? 0;
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleActionError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Request failed";
    if (message.toLowerCase().includes("already processed")) {
      toast.warning("This submission was already processed");
      setSelected(new Set());
      setRejectState(null);
      setReverseState(null);
      setBulkApproveOpen(false);
      refreshAll();
      return;
    }
    toast.error(message);
  };

  const runSingle = async (
    id: string,
    action: "approve" | "reject" | "reverse",
    rejectionReason?: string
  ) => {
    setBusyId(id);
    try {
      await postJson(
        `/api/admin/submissions/${id}`,
        {
          action,
          ...(rejectionReason ? { reason: rejectionReason } : {}),
        },
        "PATCH"
      );
      if (action === "approve") {
        toast.success("Submission approved");
      } else if (action === "reject") {
        toast.success("Submission rejected");
      } else {
        toast.success("Submission reversed to pending");
      }
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRejectState(null);
      setReverseState(null);
      refreshAll();
    } catch (err) {
      handleActionError(err);
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: "approve" | "reject" | "reverse") => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await postJson<{
        processed: number;
        skipped: number;
      }>("/api/admin/submissions/bulk", {
        ids,
        action,
        ...(action === "reject" && reason.trim()
          ? { reason: reason.trim() }
          : {}),
      });
      if (action === "approve") {
        toast.success(
          `Approved ${result.processed} submissions — syncing to sheet`
        );
      } else if (action === "reject") {
        toast.success(
          result.skipped > 0
            ? `Rejected ${result.processed} submissions, ${result.skipped} skipped`
            : `Rejected ${result.processed} submissions`
        );
      } else {
        toast.success(
          result.skipped > 0
            ? `Reversed ${result.processed} submissions, ${result.skipped} skipped`
            : `Reversed ${result.processed} submissions`
        );
      }
      setSelected(new Set());
      setRejectState(null);
      setReverseState(null);
      setBulkApproveOpen(false);
      setReason("");
      refreshAll();
    } catch (err) {
      handleActionError(err);
    } finally {
      setBulkBusy(false);
    }
  };

  const openReject = (ids: string[], bulk: boolean) => {
    setReason("");
    setRejectState({ ids, bulk });
  };

  const openReverse = (ids: string[], bulk: boolean) => {
    setReverseState({ ids, bulk });
  };

  const rejectBusy = bulkBusy || busyId !== null;
  const rejectCaption = rejectState?.bulk
    ? `${rejectState.ids.length} selected submissions will be marked as rejected.`
    : "The worker can resubmit after fixing the issue.";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Review screenshots, approve rewards and sync them to the sheet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={bulkMode ? "default" : "outline"}
            size="sm"
            onClick={toggleBulkMode}
            aria-pressed={bulkMode}
          >
            <ListChecks />
            Bulk actions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isValidating}
          >
            {isValidating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={status}
          onValueChange={(value) => {
            if (
              value === "all" ||
              value === "pending" ||
              value === "approved" ||
              value === "rejected"
            ) {
              setStatus(value);
              setPage(1);
              resetSelection();
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            {STATUS_LABELS[status]}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={taskId || "all"}
          onValueChange={(value) => {
            setTaskId(value && value !== "all" ? value : "");
            setPage(1);
            resetSelection();
          }}
        >
          <SelectTrigger className="w-full sm:w-52">
            {taskId
              ? taskData?.tasks.find((task) => task.id === taskId)?.app_name ??
                "Selected app"
              : "All apps"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All apps</SelectItem>
            {(taskData?.tasks ?? []).map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.app_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setPage(1);
            resetSelection();
          }}
          aria-label="Filter by submission date"
          className="w-full sm:w-44"
        />

        <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Reviewer name, Gmail or Sky ID"
            className="pl-8"
            aria-label="Search submissions"
          />
        </div>
      </div>

      {bulkMode && selected.size === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          <ListChecks className="size-4" />
          Bulk mode is on — tick the checkboxes to select reviews, then approve,
          reject or reverse them together.
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            {selected.size} submission{selected.size > 1 ? "s" : ""} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={bulkBusy}
              onClick={() => setBulkApproveOpen(true)}
            >
              <Check />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => openReject(Array.from(selected), true)}
            >
              <X />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => openReverse(Array.from(selected), true)}
            >
              <Undo2 />
              Reverse
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {bulkMode && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked)}
                    aria-label="Select all rows on this page"
                    disabled={rows.length === 0}
                  />
                </TableHead>
              )}
              <TableHead>User</TableHead>
              <TableHead>App</TableHead>
              <TableHead className="hidden md:table-cell">Reviewer</TableHead>
              <TableHead>Screenshot</TableHead>
              <TableHead className="hidden lg:table-cell">Submitted</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 8 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: bulkMode ? 9 : 8 }).map(
                    (__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    )
                  )}
                </TableRow>
              ))
            ) : error && !data ? (
              <TableRow>
                <TableCell
                  colSpan={bulkMode ? 9 : 8}
                  className="whitespace-normal"
                >
                  <EmptyState
                    icon={ClipboardCheck}
                    title="Could not load submissions"
                    description={error.message}
                  />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={bulkMode ? 9 : 8}
                  className="whitespace-normal"
                >
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No submissions found"
                    description="Adjust the filters or check back when workers start submitting."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {bulkMode && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) =>
                          toggleRow(row.id, checked)
                        }
                        aria-label={`Select submission from ${row.reviewer_name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <p className="font-mono text-xs font-medium">
                      {row.profile?.sky_id ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.profile?.full_name ?? "Unknown"}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.task?.app_name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="font-medium">{row.reviewer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.reviewer_gmail}
                    </p>
                  </TableCell>
                  <TableCell>
                    {row.screenshot_url ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShot({
                            url: row.screenshot_url,
                            caption: `${row.reviewer_name} · ${row.task?.app_name ?? "app"}`,
                          })
                        }
                        className="block h-10 w-16 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                        aria-label="View screenshot"
                      >
                        <Image
                          src={row.screenshot_url}
                          alt="Review screenshot"
                          width={64}
                          height={40}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No screenshot
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                    {formatDateTime(row.submitted_at)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatTK(row.reward)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "pending" ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busyId === row.id}
                          className="text-emerald-600 dark:text-emerald-400"
                          onClick={() => void runSingle(row.id, "approve")}
                        >
                          {busyId === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Check />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="text-destructive"
                          disabled={busyId === row.id}
                          onClick={() => openReject([row.id], false)}
                        >
                          <X />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busyId === row.id}
                          className="text-amber-600 dark:text-amber-400"
                          onClick={() => openReverse([row.id], false)}
                          title={
                            row.status === "approved"
                              ? "Move back to pending and deduct the reward"
                              : "Move back to pending"
                          }
                        >
                          {busyId === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Undo2 />
                          )}
                          Reverse
                        </Button>
                      </div>
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
          onPage={goToPage}
        />
      )}

      <ScreenshotDialog
        url={shot?.url ?? null}
        caption={shot?.caption}
        open={shot !== null}
        onOpenChange={(open) => {
          if (!open) setShot(null);
        }}
      />

      <AlertDialog
        open={bulkApproveOpen}
        onOpenChange={(open) => {
          if (!open && !bulkBusy) setBulkApproveOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approve {selected.size} submissions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Rewards are credited to each worker and the rows are synced to
              the Google Sheet. You can reverse this later from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={bulkBusy} onClick={() => void runBulk("approve")}>
              {bulkBusy ? <Loader2 className="animate-spin" /> : null}
              Approve {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectState !== null}
        onOpenChange={(open) => {
          if (!open && !rejectBusy) setRejectState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rejectState?.bulk
                ? `Reject ${rejectState.ids.length} submissions?`
                : "Reject this submission?"}
            </AlertDialogTitle>
            <AlertDialogDescription>{rejectCaption}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Screenshot does not show a published review"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rejectBusy}
              onClick={() => {
                const trimmed = reason.trim();
                if (!rejectState) return;
                if (rejectState.bulk) {
                  void runBulk("reject");
                } else {
                  void runSingle(rejectState.ids[0], "reject", trimmed);
                }
              }}
            >
              {rejectBusy ? <Loader2 className="animate-spin" /> : null}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={reverseState !== null}
        onOpenChange={(open) => {
          if (!open && !rejectBusy) setReverseState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reverseState?.bulk
                ? `Reverse ${reverseState.ids.length} submissions?`
                : "Reverse this submission?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each selected submission moves back to Pending. Approved
              submissions also have their reward deducted from the worker&apos;s
              balance (up to the available amount). Rejected submissions are
              simply reopened. You can approve or reject them again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rejectBusy}
              onClick={() => {
                if (!reverseState) return;
                if (reverseState.bulk) {
                  void runBulk("reverse");
                } else {
                  void runSingle(reverseState.ids[0], "reverse");
                }
              }}
            >
              {rejectBusy ? <Loader2 className="animate-spin" /> : null}
              Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
