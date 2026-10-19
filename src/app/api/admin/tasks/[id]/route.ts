import type { NextRequest } from "next/server";
import { withApi, requireAdmin, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPackageInfo } from "@/lib/packages";
import {
  taskFormPatchSchema,
  endAfterStart,
  dailyEndAfterStart,
  parseTextReviews,
} from "@/lib/validations";
import { fromDatetimeLocal } from "@/lib/format";
import { syncTextReviewPool } from "@/lib/text-reviews";
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

    const parsed = taskFormPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const value = parsed.data;

    // Only touch keys that were actually sent: schema defaults
    // (description/banner "" , reward 0, null dates) must never wipe
    // existing columns on a partial update like a status toggle.
    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key);

    if (!endAfterStart(value)) {
      throw new ApiError("End time must be after start time");
    }
    if (!dailyEndAfterStart(value)) {
      throw new ApiError("Close time must be after open time");
    }
    if (
      value.generation_mode === "text" &&
      has("text_reviews") &&
      parseTextReviews(value.text_reviews).length === 0
    ) {
      throw new ApiError("Add at least one review line");
    }
    if (
      value.generation_mode === "prompt" &&
      has("ai_prompt") &&
      !value.ai_prompt?.trim()
    ) {
      throw new ApiError("AI prompt is required");
    }

    const payload: Record<string, unknown> = {};
    if (has("app_name")) payload.app_name = value.app_name;
    if (has("app_link") && typeof value.app_link === "string") {
      payload.app_link = value.app_link;
      const extracted = extractPackageInfo(value.app_link);
      if (extracted) {
        payload.package_name = extracted.package_name;
        payload.platform = extracted.platform;
      }
    }
    if (!("package_name" in payload) && has("package_name")) {
      payload.package_name = value.package_name;
    }
    if (!("platform" in payload) && has("platform")) {
      payload.platform = value.platform;
    }
    if (has("description"))
      payload.description = (value.description ?? "").trim() || null;
    if (has("banner_url"))
      payload.banner_url = (value.banner_url ?? "").trim() || null;
    if (has("reward")) payload.reward = value.reward;
    if (has("daily_limit")) payload.daily_limit = value.daily_limit;
    if (has("per_user_limit")) payload.per_user_limit = value.per_user_limit;
    if (has("generation_mode")) payload.generation_mode = value.generation_mode;
    if (has("ai_prompt")) payload.ai_prompt = value.ai_prompt;
    if (has("text_reviews")) payload.text_reviews = value.text_reviews || null;
    if (has("cron_time")) payload.cron_time = value.cron_time;
    if (has("fail_action")) payload.fail_action = value.fail_action;
    if (has("start_at")) payload.start_at = fromDatetimeLocal(value.start_at ?? "");
    if (has("end_at")) payload.end_at = fromDatetimeLocal(value.end_at ?? "");
    if (has("start_time")) payload.start_time = value.start_time ?? null;
    if (has("end_time")) payload.end_time = value.end_time ?? null;
    if (has("status")) payload.status = value.status;

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
    ) as Task;

    if (task.generation_mode === "text") {
      await syncTextReviewPool(
        admin,
        task.id,
        parseTextReviews(task.text_reviews)
      );
    }

    return Response.json({ task });
  });
}
