import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncApprovedToSheet } from "@/lib/approvals";
import type { Task, VerifyResult } from "@/lib/types";

const LOCK_KEY = "approval_lock";
const LOCK_COOLDOWN_MS = 5 * 60 * 1000;
const PENDING_RETRY_AGE_MS = 15 * 60 * 1000;
const REJECTED_AGE_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 60 * 1000;

interface DhakaClock {
  date: string;
  minutes: number;
}

function dhakaClock(): DhakaClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

interface TaskRunResult {
  approved: number;
  rejected: number;
  left_pending: number;
  scraped: number;
  responded: boolean;
  error?: string;
}

export interface ApprovalCycleSummary {
  run_date: string;
  clock_minutes: number;
  trigger: string;
  due_tasks: number;
  approved: number;
  rejected: number;
  left_pending: number;
  scraped: number;
  task_runs: Array<{
    app_name: string;
    approved: number;
    rejected: number;
    left_pending: number;
    responded: boolean;
    error?: string;
  }>;
  backlog_sheet_synced: number;
  sheet_error?: string;
  errors: string[];
}

async function claimLock(admin: SupabaseClient): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_COOLDOWN_MS).toISOString();
  const { data, error } = await admin
    .from("app_settings")
    .update({ value: { locked_at: new Date().toISOString() } })
    .eq("key", LOCK_KEY)
    .filter("value->>locked_at", "lt", staleBefore)
    .select("key");

  if (error) {
    console.error("[approval] lock claim failed:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

async function verifyTask(
  admin: SupabaseClient,
  task: Task
): Promise<TaskRunResult> {
  const ageMs =
    task.fail_action === "rejected" ? REJECTED_AGE_MS : PENDING_RETRY_AGE_MS;
  const eligibleBefore = new Date(Date.now() - ageMs).toISOString();
  const retryBefore = new Date(Date.now() - RETRY_AFTER_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");

  const { data: submissions, error } = await admin
    .from("submissions")
    .select("id, reviewer_name, submitted_date")
    .eq("task_id", task.id)
    .eq("status", "pending")
    .lte("submitted_at", eligibleBefore)
    .or(`verify_attempted_at.is.null,verify_attempted_at.lt.${retryBefore}`);

  if (error) throw new Error(error.message);

  if (!submissions || submissions.length === 0) {
    return {
      approved: 0,
      rejected: 0,
      left_pending: 0,
      scraped: 0,
      responded: true,
    };
  }

  const markAttempted = async () => {
    const { error: markError } = await admin
      .from("submissions")
      .update({
        verify_attempted: true,
        verify_attempted_at: new Date().toISOString(),
      })
      .in("id", submissions.map((row) => row.id));
    if (markError) throw new Error(markError.message);
  };

  const baseUrl = process.env.PYTHON_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    await markAttempted();
    return {
      approved: 0,
      rejected: 0,
      left_pending: submissions.length,
      scraped: 0,
      responded: false,
      error: "PYTHON_SERVICE_URL not configured",
    };
  }

  let payload: { results?: VerifyResult[] };
  try {
    const response = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret": process.env.PYTHON_SERVICE_SECRET ?? "",
      },
      body: JSON.stringify({
        task: { package_name: task.package_name, platform: task.platform },
        submissions: submissions.map((row) => ({
          id: row.id,
          reviewer_name: row.reviewer_name,
          submitted_date: row.submitted_date,
        })),
      }),
      signal: AbortSignal.timeout(240000),
    });

    if (!response.ok) {
      await markAttempted();
      return {
        approved: 0,
        rejected: 0,
        left_pending: submissions.length,
        scraped: 0,
        responded: false,
        error: `verify service responded ${response.status}`,
      };
    }

    payload = (await response.json()) as { results?: VerifyResult[] };
  } catch (error) {
    await markAttempted();
    return {
      approved: 0,
      rejected: 0,
      left_pending: submissions.length,
      scraped: 0,
      responded: false,
      error: `verify service failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    };
  }

  const results = payload.results ?? [];
  const foundIds = results.filter((row) => row.found).map((row) => row.id);
  const missingIds = results
    .filter((row) => !row.found)
    .map((row) => row.id);

  let approved = 0;
  let rejected = 0;
  let leftPending = 0;

  if (foundIds.length > 0) {
    const { data, error: approveError } = await admin.rpc(
      "approve_submissions",
      { p_ids: foundIds, p_verified_by: "cron" }
    );
    if (approveError) throw new Error(approveError.message);
    const affected = (data ?? []) as { id: string }[];
    approved = affected.length;
    if (affected.length > 0) {
      await syncApprovedToSheet(
        admin,
        affected.map((row) => row.id)
      );
    }
  }

  if (missingIds.length > 0) {
    if (task.fail_action === "rejected") {
      const { error: rejectError } = await admin.rpc("reject_submissions", {
        p_ids: missingIds,
        p_reason: "Review not published on the store",
      });
      if (rejectError) throw new Error(rejectError.message);
      rejected = missingIds.length;
    } else {
      const { error: pendingError } = await admin
        .from("submissions")
        .update({
          verify_attempted: true,
          verify_attempted_at: new Date().toISOString(),
        })
        .in("id", missingIds);
      if (pendingError) throw new Error(pendingError.message);
      leftPending = missingIds.length;
    }
  }

  return {
    approved,
    rejected,
    left_pending: leftPending,
    scraped: payload.results ? missingIds.length + foundIds.length : 0,
    responded: true,
  };
}

export async function runApprovalCycle(
  admin: SupabaseClient,
  trigger: string
): Promise<ApprovalCycleSummary> {
  const clock = dhakaClock();

  const summary: ApprovalCycleSummary = {
    run_date: clock.date,
    clock_minutes: clock.minutes,
    trigger,
    due_tasks: 0,
    approved: 0,
    rejected: 0,
    left_pending: 0,
    scraped: 0,
    task_runs: [],
    backlog_sheet_synced: 0,
    errors: [],
  };

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("*")
    .eq("status", "active");

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const due = (tasks ?? []).filter(
    (task) =>
      task.cron_time && clock.minutes >= toMinutes(task.cron_time)
  );
  summary.due_tasks = due.length;

  if (due.length === 0) return summary;

  const claimed = await claimLock(admin);
  if (!claimed) return summary;

  for (const task of due) {
    try {
      const result = await verifyTask(admin, task);
      summary.approved += result.approved;
      summary.rejected += result.rejected;
      summary.left_pending += result.left_pending;
      summary.scraped += result.scraped;
      summary.task_runs.push({
        app_name: task.app_name,
        approved: result.approved,
        rejected: result.rejected,
        left_pending: result.left_pending,
        responded: result.responded,
        error: result.error,
      });

      if (result.responded) {
        await admin
          .from("tasks")
          .update({ last_verify_date: clock.date })
          .eq("id", task.id);
      }
      if (result.error) {
        summary.errors.push(`${task.app_name}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "task failed";
      summary.errors.push(`${task.app_name}: ${message}`);
      summary.task_runs.push({
        app_name: task.app_name,
        approved: 0,
        rejected: 0,
        left_pending: 0,
        responded: false,
        error: message,
      });
    }
  }

  try {
    const backlog = await syncApprovedToSheet(admin);
    summary.backlog_sheet_synced = backlog.synced;
    if (backlog.error) summary.sheet_error = backlog.error;
  } catch (error) {
    summary.sheet_error =
      error instanceof Error ? error.message : "sheet sync failed";
  }

  return summary;
}

export function scheduleApprovalCycle(trigger: string): void {
  after(async () => {
    try {
      const summary = await runApprovalCycle(createAdminClient(), trigger);
      if (
        summary.due_tasks > 0 ||
        summary.approved > 0 ||
        summary.errors.length > 0
      ) {
        console.log(`[approval:${trigger}]`, JSON.stringify(summary));
      }
    } catch (error) {
      console.error(
        `[approval:${trigger}] failed:`,
        error instanceof Error ? error.message : error
      );
    }
  });
}
