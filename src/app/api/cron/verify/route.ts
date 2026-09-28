import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncApprovedToSheet } from "@/lib/approvals";
import type { Task, VerifyResult } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

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

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

interface TaskRunResult {
  approved: number;
  rejected: number;
  left_pending: number;
  scraped: number;
  responded: boolean;
  error?: string;
}

async function verifyTask(
  admin: SupabaseClient,
  task: Task,
  today: string
): Promise<TaskRunResult> {
  const { data: submissions, error } = await admin
    .from("submissions")
    .select("id, reviewer_name, submitted_date")
    .eq("task_id", task.id)
    .eq("status", "pending")
    .eq("verify_attempted", false)
    .lt("submitted_date", today);

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

  const baseUrl = process.env.PYTHON_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return {
      approved: 0,
      rejected: 0,
      left_pending: 0,
      scraped: 0,
      responded: false,
      error: "PYTHON_SERVICE_URL not configured",
    };
  }

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
    return {
      approved: 0,
      rejected: 0,
      left_pending: submissions.length,
      scraped: 0,
      responded: true,
      error: `verify service responded ${response.status}`,
    };
  }

  const payload = (await response.json()) as { results?: VerifyResult[] };
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
      const { error: pendingError } = await admin.rpc(
        "set_verify_attempted",
        { p_ids: missingIds }
      );
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

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const clock = dhakaClock();

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("*")
    .eq("status", "active");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const due = (tasks ?? []).filter((task) => {
    const [hour, minute] = task.cron_time.split(":").map(Number);
    const dueAt = (hour || 0) * 60 + (minute || 0);
    return clock.minutes >= dueAt && task.last_verify_date !== clock.date;
  });

  const summary: {
    run_date: string;
    clock_minutes: number;
    due_tasks: number;
    approved: number;
    rejected: number;
    left_pending: number;
    sheet_synced: number;
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
  } = {
    run_date: clock.date,
    clock_minutes: clock.minutes,
    due_tasks: due.length,
    approved: 0,
    rejected: 0,
    left_pending: 0,
    sheet_synced: 0,
    task_runs: [],
    backlog_sheet_synced: 0,
    errors: [],
  };

  for (const task of due) {
    try {
      const result = await verifyTask(admin, task, clock.date);
      summary.approved += result.approved;
      summary.rejected += result.rejected;
      summary.left_pending += result.left_pending;
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
      } else if (result.error) {
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

  return Response.json(summary);
}
