import type { NextRequest } from "next/server";
import { withApi, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { generateReviewText } from "@/lib/groq";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReviewSchema } from "@/lib/validations";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function POST(request: NextRequest) {
  return withApi(async () => {
    const { supabase } = await requireUser();

    const body = await request.json();
    const parsed = generateReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, app_name, ai_prompt, status, start_at, end_at")
      .eq("id", parsed.data.task_id)
      .single();

    if (error || !task) throw new ApiError("Task not found", 404);
    if (task.status !== "active") throw new ApiError("Task is inactive", 400);
    if (!task.ai_prompt?.trim()) {
      throw new ApiError("No AI prompt configured for this app yet", 400);
    }

    const admin = createAdminClient();

    const { data: historyRows, error: historyError } = await admin
      .from("review_history")
      .select("review")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (historyError) {
      console.error("review_history load failed:", historyError.message);
    }

    const history = (historyRows ?? []).map((row) => row.review);
    const recent = history.slice(0, 20);
    const normalizedHistory = history.map(normalize);

    const isDuplicate = (text: string) => {
      const norm = normalize(text);
      if (!norm) return true;
      if (normalizedHistory.includes(norm)) return true;
      if (norm.length >= 40) {
        return normalizedHistory.some(
          (past) => past.length >= 40 && (past.includes(norm) || norm.includes(past))
        );
      }
      return false;
    };

    let review = await generateReviewText(task.ai_prompt, task.app_name, recent);

    if (isDuplicate(review)) {
      review = await generateReviewText(
        task.ai_prompt,
        task.app_name,
        recent,
        "The previous output duplicated a review that already exists for this app. Rewrite with completely different wording, structure, and opening sentence."
      );
      if (isDuplicate(review)) {
        throw new ApiError("AI returned a duplicate review, please try again", 502);
      }
    }

    const { error: saveError } = await admin.rpc("save_review_history", {
      p_task_id: task.id,
      p_review: review,
    });
    if (saveError) {
      console.error("review_history save failed:", saveError.message);
    }

    return Response.json({ review });
  });
}
