"use client";

import { useState } from "react";
import { mutate } from "swr";
import { AppWindow, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { TaskDialog } from "@/components/admin/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTK } from "@/lib/format";
import { postJson, useApi } from "@/lib/hooks";
import type { Task } from "@/lib/types";

function formatCron(value: string): string {
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const minute = Number(minuteText);
  if (Number.isNaN(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function AdminTasksPage() {
  const { data, error, isLoading, mutate: refresh } = useApi<{
    tasks: Task[];
  }>("/api/admin/tasks");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refreshAll = () => {
    void refresh();
    void mutate(() => true);
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const toggleStatus = async (task: Task) => {
    const next = task.status === "active" ? "inactive" : "active";
    setSavingId(task.id);
    try {
      await postJson(`/api/admin/tasks/${task.id}`, { status: next }, "PATCH");
      toast.success(
        next === "active"
          ? `${task.app_name} is now active`
          : `${task.app_name} paused`
      );
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update task");
    } finally {
      setSavingId(null);
    }
  };

  const tasks = data?.tasks ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">App Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Create and schedule the review tasks workers see in their panel
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          New App Task
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead className="hidden md:table-cell">
                Package name
              </TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Daily limit
              </TableHead>
              <TableHead className="hidden lg:table-cell">Cron time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error && !data ? (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal">
                  <EmptyState
                    icon={AppWindow}
                    title="Could not load tasks"
                    description={error.message}
                  />
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal">
                  <EmptyState
                    icon={AppWindow}
                    title="No app tasks yet"
                    description="Create your first task so workers can start submitting reviews."
                  />
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{task.app_name}</p>
                        <p className="truncate text-xs text-muted-foreground md:hidden">
                          <span className="font-mono">{task.package_name}</span>
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          task.platform === "android"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        }
                      >
                        {task.platform === "ios" ? "iOS" : "Android"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-56 md:table-cell">
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {task.package_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatTK(task.reward)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {task.daily_limit ?? "∞"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatCron(task.cron_time)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Switch
                        checked={task.status === "active"}
                        disabled={savingId === task.id}
                        onCheckedChange={() => void toggleStatus(task)}
                        aria-label={`${task.app_name} status`}
                      />
                      {savingId === task.id ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {task.status === "active" ? "Active" : "Inactive"}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(task)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TaskDialog
        task={editing}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
