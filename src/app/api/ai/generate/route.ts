import type { NextRequest } from "next/server";
import { withApi, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { generateReviewText } from "@/lib/groq";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTextReviews, generateReviewSchema } from "@/lib/validations";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 200;
const PROMPT_EXAMPLES = 12;
const RECENT_EXAMPLES = 8;
// Round 1 runs a single candidate (common case = one AI call). Later rounds
// generate two candidates in parallel. No DB similarity gate exists anymore:
// uniqueness comes from the prompt (recent reviews the model must avoid) plus
// an in-memory guard that only retries when the output is word-for-word
// identical to something already handed out.
const MAX_ROUNDS = 3;

const VARIATION_HINTS = [
  "Pick a reference or core idea that none of the recent reviews listed above appear to be based on.",
  "If your first instinct matches a recent review, switch to a completely different reference or idea.",
  "Choose the least-used looking idea from the admin's pool rather than the most obvious one.",
  "Write it exactly as a casual real user would — natural words, nothing forced or word-swapped.",
  "Vary the rhythm and opening (short punchy start vs a fuller sentence), keeping the wording natural.",
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function pickExamples(reviews: string[]): string[] {
  if (reviews.length <= PROMPT_EXAMPLES) return reviews;
  const newest = reviews.slice(0, RECENT_EXAMPLES);
  const older = reviews.slice(RECENT_EXAMPLES);
  const needed = PROMPT_EXAMPLES - newest.length;
  const step = Math.max(1, Math.floor(older.length / needed));
  const spread: string[] = [];
  for (let i = 0; i < older.length && spread.length < needed; i += step) {
    spread.push(older[i]);
  }
  return [...newest, ...spread];
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    const { supabase, profile } = await requireUser();

    const body = await request.json();
    const parsed = generateReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .select(
        "id, app_name, ai_prompt, generation_mode, text_reviews, fixed_user_mode, status, start_at, end_at"
      )
      .eq("id", parsed.data.task_id)
      .single();

    if (error || !task) throw new ApiError("Task not found", 404);
    if (task.status !== "active") throw new ApiError("Task is inactive", 400);

    const admin = createAdminClient();

    // Fixed-user tasks: only the selected members may generate for this app.
    if (task.fixed_user_mode) {
      const { data: membership, error: memberError } = await admin
        .from("task_fixed_users")
        .select("user_id")
        .eq("task_id", task.id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (memberError) {
        throw new ApiError("Could not verify access", 502);
      }
      if (!membership) {
        throw new ApiError("This app is not available for your account", 403);
      }
    }

    // Text mode: hand out one unused review from the admin's fixed list.
    // A review is marked used only when the worker copies it (POST /api/ai/claim),
    // so generating does not consume it — regenerate can re-show it.
    if (task.generation_mode === "text") {
      const pool = parseTextReviews(task.text_reviews);
      if (pool.length === 0) {
        throw new ApiError("No reviews available for this app yet", 400);
      }

      const { data: usedRows, error: usedError } = await admin
        .from("task_text_reviews")
        .select("review")
        .eq("task_id", task.id)
        .not("used_at", "is", null);

      if (usedError) {
        throw new ApiError("Could not check review availability", 502);
      }

      const used = new Set((usedRows ?? []).map((row) => row.review));
      const available = pool.filter((entry) => !used.has(entry));
      if (available.length === 0) {
        throw new ApiError(
          "All reviews for this app have been used already",
          400
        );
      }

      const review = available[Math.floor(Math.random() * available.length)];
      return Response.json({ review });
    }

    if (!task.ai_prompt?.trim()) {
      throw new ApiError("No AI prompt configured for this app yet", 400);
    }

    const loadHistory = async (): Promise<string[]> => {
      const { data, error: historyError } = await admin
        .from("review_history")
        .select("review")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (historyError) {
        // History only feeds the uniqueness prompt — never block generation.
        console.error("review_history load failed:", historyError.message);
        return [];
      }

      return (data ?? [])
        .map((row) => (row.review ?? "").trim())
        .filter((entry) => entry.length > 0);
    };

    const history = await loadHistory();
    const claimed = new Set(history.map(normalize));
    const recent = pickExamples(history);
    let feedback: string | undefined;
    let lastAiError: unknown;
    let hadIdentical = false;

    const pickHint = () =>
      VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const candidateCount = round === 1 ? 1 : 2;
      const hints: string[] = [];
      for (let i = 0; i < candidateCount; i++) {
        let hint = pickHint();
        if (i > 0 && hint === hints[0]) {
          hint = VARIATION_HINTS[(VARIATION_HINTS.indexOf(hint) + 1) % VARIATION_HINTS.length];
        }
        hints.push(hint);
      }

      const settled = await Promise.allSettled(
        hints.map((hint) =>
          generateReviewText(task.ai_prompt, task.app_name, recent, feedback, hint)
        )
      );

      for (const result of settled) {
        if (result.status === "rejected") {
          lastAiError = result.reason;
          continue;
        }
        const text = result.value.trim();
        if (!text) continue;

        // Never hand out the exact same review twice; anything else is fine.
        const key = normalize(text);
        if (claimed.has(key)) {
          hadIdentical = true;
          feedback =
            "Your output was word-for-word identical to a review already generated for this app. Write a fresh review based on a different reference or core idea from the admin's pool — do not repeat any wording.";
          continue;
        }

        const { error: saveError } = await admin.rpc("save_review_history", {
          p_task_id: task.id,
          p_review: text,
        });
        if (saveError) {
          console.error("review save failed:", saveError.message);
          throw new ApiError(
            "Could not record the generated review, please try again",
            502
          );
        }

        claimed.add(key);
        return Response.json({ review: text });
      }
    }

    if (!hadIdentical && lastAiError) throw lastAiError;

    throw new ApiError(
      "AI keeps returning an already-used review, please try again",
      502
    );
  });
}
