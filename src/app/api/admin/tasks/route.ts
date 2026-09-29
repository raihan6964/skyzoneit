import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPackageInfo } from "@/lib/packages";
import { taskFormSchema } from "@/lib/validations";
import { fromDatetimeLocal } from "@/lib/format";
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
    app_name: value.app_name,
    app_link: value.app_link,
    package_name: extracted?.package_name ?? value.package_name,
    platform: extracted?.platform ?? value.platform,
    description: value.description?.trim() || null,
    banner_url: value.banner_url?.trim() || null,
    reward: value.reward,
    daily_limit: value.daily_limit,
    ai_prompt: value.ai_prompt,
    cron_time: value.cron_time,
    fail_action: value.fail_action,
    start_at: fromDatetimeLocal(value.start_at ?? ""),
    end_at: fromDatetimeLocal(value.end_at ?? ""),
    start_time: value.start_time ?? null,
    end_time: value.end_time ?? null,
    status: value.status,
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
    return Response.json({ tasks: data ?? [] });
  });
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    await requireAdmin();
    const admin = createAdminClient();
    const body = await request.json();
    const payload = normalizeTaskInput(body);
    const task = unwrap(
      await admin.from("tasks").insert(payload).select("*").single()
    );
    return Response.json({ task: task as Task }, { status: 201 });
  });
}
