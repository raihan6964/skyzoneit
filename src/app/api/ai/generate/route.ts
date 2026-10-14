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
const MAX_GENERATION_ATTEMPTS = 3;
const DUPLICATE_THRESHOLD = 0.6;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string) => value.split(" ").filter(Boolean);

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

function similarity(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let shared = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) shared += 1;
  });
  const union = aSet.size + bSet.size - shared;
  const jaccard = union > 0 ? shared / union : 0;

  const aPairs = bigrams(aTokens);
  const bPairs = bigrams(bTokens);
  let sharedPairs = 0;
  aPairs.forEach((pair) => {
    if (bPairs.has(pair)) sharedPairs += 1;
  });
  const bigramRecall = aPairs.size > 0 ? sharedPairs / aPairs.size : 0;

  return Math.max(jaccard, bigramRecall);
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

    const { data: historyRows, error: historyError } = await admin
      .from("review_history")
      .select("review")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (historyError) {
      console.error("review_history load failed:", historyError.message);
      throw new ApiError("Could not verify review uniqueness, please try again", 502);
    }

    const history = (historyRows ?? []).map((row) => row.review);
    const recent = history.slice(0, PROMPT_EXAMPLES);
    const normalizedHistory = history
      .map(normalize)
      .filter((entry) => entry.length > 0);

    const isDuplicate = (text: string) => {
      const norm = normalize(text);
      if (!norm) return true;
      if (normalizedHistory.includes(norm)) return true;
      if (norm.length >= 40) {
        const contained = normalizedHistory.some(
          (past) => past.length >= 40 && (past.includes(norm) || norm.includes(past))
        );
        if (contained) return true;
      }
      return normalizedHistory.some((past) => similarity(norm, past) >= DUPLICATE_THRESHOLD);
    };

    let review = "";
    let retryFeedback: string | undefined;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      review = await generateReviewText(
        task.ai_prompt,
        task.app_name,
        recent,
        retryFeedback
      );
      if (!isDuplicate(review)) break;

      if (attempt === MAX_GENERATION_ATTEMPTS) {
        throw new ApiError(
          "AI returned a review too similar to an existing one, please try again",
          502
        );
      }
      retryFeedback =
        "Your previous output repeated or closely imitated a review that already exists for this app. Keep following the admin instructions exactly as written, but rewrite with a completely different opening sentence, structure, vocabulary and phrasing so it cannot be matched to any earlier review.";
    }

    const { error: saveError } = await admin.rpc("save_review_history", {
      p_task_id: task.id,
      p_review: review,
    });
    if (saveError) {
      console.error("review_history save failed:", saveError.message);
      if (/duplicate/i.test(saveError.message)) {
        throw new ApiError(
          "AI returned a review too similar to an existing one, please try again",
          502
        );
      }
      throw new ApiError(
        "Could not record the generated review, please try again",
        502
      );
    }

    return Response.json({ review });
  });
}
