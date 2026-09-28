import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPackageInfo } from "@/lib/packages";
import { taskFormSchema } from "@/lib/validations";
import { fromDatetimeLocal } from "@/lib/format";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/tasks/[id]">
) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createAdminClient();
    const body = await request.json();

    const parsed = taskFormSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const value = parsed.data;

    const payload: Record<string, unknown> = {};
    if (value.app_name !== undefined) payload.app_name = value.app_name;
    if (value.app_link !== undefined) {
      payload.app_link = value.app_link;
      const extracted = extractPackageInfo(value.app_link);
      if (extracted) {
        payload.package_name = extracted.package_name;
        payload.platform = extracted.platform;
      } else if (value.package_name !== undefined) {
        payload.package_name = value.package_name;
      }
    } else if (value.package_name !== undefined) {
      payload.package_name = value.package_name;
    }
    if (value.platform !== undefined && payload.package_name === undefined)
      payload.platform = value.platform;
    if (value.description !== undefined)
      payload.description = value.description.trim() || null;
    if (value.banner_url !== undefined)
      payload.banner_url = value.banner_url.trim() || null;
    if (value.reward !== undefined) payload.reward = value.reward;
    if (value.daily_limit !== undefined) payload.daily_limit = value.daily_limit;
    if (value.ai_prompt !== undefined) payload.ai_prompt = value.ai_prompt;
    if (value.cron_time !== undefined) payload.cron_time = value.cron_time;
    if (value.fail_action !== undefined) payload.fail_action = value.fail_action;
    if (value.start_at !== undefined)
      payload.start_at = fromDatetimeLocal(value.start_at ?? "");
    if (value.end_at !== undefined)
      payload.end_at = fromDatetimeLocal(value.end_at ?? "");
    if (value.status !== undefined) payload.status = value.status;

    if (Object.keys(payload).length === 0) {
      throw new ApiError("Nothing to update");
    }

    const task = unwrap(
      await admin
        .from("tasks")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single()
    );

    return Response.json({ task: task as Task });
  });
}
