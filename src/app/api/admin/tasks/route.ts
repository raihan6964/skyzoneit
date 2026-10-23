import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPackageInfo } from "@/lib/packages";
import { parseTextReviews, taskFormSchema } from "@/lib/validations";
import { fromDatetimeLocal } from "@/lib/format";
import { syncTextReviewPool } from "@/lib/text-reviews";
import { syncTaskFixedUsers } from "@/lib/fixed-users";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizeTaskInput(body: unknown) {
  const parsed = taskFormSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const value = parsed.data;
  const extracted = extractPackageInfo(value.app_link);

  return {
    value,
    payload: {
      app_name: value.app_name,
      app_link: value.app_link,
      package_name: extracted?.package_name ?? value.package_name,
      platform: extracted?.platform ?? value.platform,
      description: value.description?.trim() || null,
      banner_url: value.banner_url?.trim() || null,
      reward: value.reward,
      daily_limit: value.daily_limit,
      per_user_limit: value.per_user_limit,
      generation_mode: value.generation_mode,
      ai_prompt: value.ai_prompt,
      text_reviews: value.text_reviews || null,
      fixed_user_mode: value.fixed_user_mode,
      cron_time: value.cron_time,
      fail_action: value.fail_action,
      start_at: fromDatetimeLocal(value.start_at ?? ""),
      end_at: fromDatetimeLocal(value.end_at ?? ""),
      start_time: value.start_time ?? null,
      end_time: value.end_time ?? null,
      status: value.status,
    },
  };
}

export async function GET() {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tasks = data ?? [];
    const restricted = tasks.filter((task) => task.fixed_user_mode);
    if (restricted.length > 0) {
      const { data: fixedRows, error: fixedError } = await admin
        .from("task_fixed_users")
        .select("task_id, user_id, daily_limit, profile:profiles(sky_id, full_name, email)")
        .in(
          "task_id",
          restricted.map((task) => task.id)
        );
      if (fixedError) throw new Error(fixedError.message);

      const byTask = new Map<string, NonNullable<Task["fixed_users"]>>();
      for (const row of (fixedRows ?? []) as unknown as {
        task_id: string;
        user_id: string;
        daily_limit: number;
        profile: { sky_id: string; full_name: string | null; email: string | null } | null;
      }[]) {
        const list = byTask.get(row.task_id) ?? [];
        list.push({
          user_id: row.user_id,
          daily_limit: row.daily_limit,
          profile: row.profile,
        });
        byTask.set(row.task_id, list);
      }
      for (const task of tasks) {
        (task as Task).fixed_users = byTask.get(task.id) ?? [];
      }
    }

    return Response.json({ tasks });
  });
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    const body = await request.json();
    const { value, payload } = normalizeTaskInput(body);
    const task = unwrap(
      await admin.from("tasks").insert(payload).select("*").single()
    ) as Task;
    if (task.generation_mode === "text") {
      await syncTextReviewPool(
        admin,
        task.id,
        parseTextReviews(task.text_reviews)
      );
    }
    if (task.fixed_user_mode) {
      await syncTaskFixedUsers(admin, task.id, value.fixed_users);
    }
    return Response.json({ task }, { status: 201 });
  });
}
