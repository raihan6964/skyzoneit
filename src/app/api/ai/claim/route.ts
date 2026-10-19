import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTextReviews } from "@/lib/validations";

export const dynamic = "force-dynamic";

const claimSchema = z.object({
  task_id: z.uuid("Invalid task"),
  review: z.string().trim().min(1).max(5000),
});

// Mark a text-mode review as used (fired by the client when the worker copies
// it). Prompt-mode tasks are a no-op: their reviews are already recorded in
// review_history at generate time.
export async function POST(request: NextRequest) {
  return withApi(async () => {
    await requireUser();

    const body = await request.json();
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { task_id: taskId, review } = parsed.data;

    const admin = createAdminClient();
    const { data: task, error } = await admin
      .from("tasks")
      .select("generation_mode, text_reviews")
      .eq("id", taskId)
      .single();

    if (error || !task) throw new ApiError("Task not found", 404);
    if (task.generation_mode !== "text") {
      return Response.json({ claimed: false });
    }

    // Only accept reviews that are actually part of the admin's list.
    if (!parseTextReviews(task.text_reviews).includes(review)) {
      throw new ApiError("Unknown review for this app", 400);
    }

    const { error: upsertError } = await admin
      .from("task_text_reviews")
      .upsert(
        { task_id: taskId, review, used_at: new Date().toISOString() },
        { onConflict: "task_id,review" }
      );

    if (upsertError) {
      console.error("text review claim failed:", upsertError.message);
      throw new ApiError("Could not mark the review as used", 502);
    }

    return Response.json({ claimed: true });
  });
}
