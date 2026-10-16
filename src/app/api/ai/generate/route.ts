import type { NextRequest } from "next/server";
import { withApi, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { generateReviewText } from "@/lib/groq";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReviewSchema } from "@/lib/validations";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 500;
const PROMPT_EXAMPLES = 25;
const RECENT_EXAMPLES = 15;
// Round 1 runs a single candidate (common case = one AI call). Every later
// round generates two candidates in parallel, so recovery costs one extra
// wall-clock wave instead of one call per attempt.
const MAX_ROUNDS = 4;

const VARIATION_HINTS = [
  "Pick a reference or core idea that none of the recent reviews listed above appear to be based on.",
  "If your first instinct matches a recent review, switch to a completely different reference or idea.",
  "Choose the least-used looking idea from the admin's pool rather than the most obvious one.",
  "Write it exactly as a casual real user would — natural words, nothing forced or word-swapped.",
  "Vary the rhythm and opening (short punchy start vs a fuller sentence), keeping the wording natural.",
];

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

    const loadRecent = async () => {
      const { data, error: historyError } = await admin
        .from("review_history")
        .select("review")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (historyError) {
        console.error("review_history load failed:", historyError.message);
        throw new ApiError(
          "Could not verify review uniqueness, please try again",
          502
        );
      }

      const raw = (data ?? [])
        .map((row) => (row.review ?? "").trim())
        .filter((entry) => entry.length > 0);
      return pickExamples(raw);
    };

    let recent = await loadRecent();
    let feedback: string | undefined;
    let lastAiError: unknown;
    let hadClaimRejection = false;

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

      let rejectionMessage = "";
      let nearestReview = "";

      for (const result of settled) {
        if (result.status === "rejected") {
          lastAiError = result.reason;
          continue;
        }
        const text = result.value;
        if (!text.trim()) continue;

        const { error: claimError } = await admin.rpc("save_review_history", {
          p_task_id: task.id,
          p_review: text,
        });
        if (!claimError) return Response.json({ review: text });

        console.error("review claim failed:", claimError.message);
        if (/duplicate|similar/i.test(claimError.message)) {
          hadClaimRejection = true;
          rejectionMessage = claimError.message;
          if (!nearestReview) {
            try {
              const { data: near } = await admin.rpc("find_nearest_review", {
                p_task_id: task.id,
                p_review: text,
              });
              const nearReview = (near as { review?: string } | null)?.review;
              if (nearReview) nearestReview = nearReview;
            } catch {
              // nearest lookup is best-effort; generic feedback still applies
            }
          }
          continue;
        }
        throw new ApiError(
          "Could not record the generated review, please try again",
          502
        );
      }

      if (rejectionMessage) {
        // Fresh examples so the next wave also avoids what was just claimed.
        recent = await loadRecent();
        feedback = nearestReview
          ? `Your output was too close to an existing review for this app. The closest existing review is: "${nearestReview.slice(0, 200)}". Do NOT reuse its wording, structure, or swap words from it — pick a completely different reference from the admin's pool and write a fresh, natural review following the admin instructions.`
          : /duplicate/i.test(rejectionMessage)
            ? "Your output was identical to a review that already exists for this app. Pick a different reference or core idea from the admin's pool (one the recent reviews do not appear to be based on) and write it naturally from scratch — do not word-swap an existing phrasing."
            : "Your output was too similar to an existing review for this app. Do not swap individual words or change the subject to escape the match — choose a different reference or core idea from the admin's pool and write it naturally, following the admin instructions exactly.";
      }
    }

    if (!hadClaimRejection && lastAiError) throw lastAiError;

    throw new ApiError(
      "AI keeps returning a review that already exists, please try again",
      502
    );
  });
}
