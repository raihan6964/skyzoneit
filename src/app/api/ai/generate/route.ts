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
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_SAVE_ATTEMPTS = 2;
const DUPLICATE_THRESHOLD = 0.7;
const EXACT_WINDOW = 40;

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
  const pairUnion = aPairs.size + bPairs.size - sharedPairs;
  const pairJaccard = pairUnion > 0 ? sharedPairs / pairUnion : 0;

  const recallA = aPairs.size > 0 ? sharedPairs / aPairs.size : 0;
  const recallB = bPairs.size > 0 ? sharedPairs / bPairs.size : 0;
  const lengthRatio =
    Math.min(aTokens.length, bTokens.length) /
    Math.max(aTokens.length, bTokens.length);

  return Math.max(jaccard, pairJaccard, lengthRatio * Math.min(recallA, recallB));
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

    const rawHistory = (historyRows ?? [])
      .map((row) => (row.review ?? "").trim())
      .filter((entry) => entry.length > 0);
    const history = rawHistory.map(normalize).filter((entry) => entry.length > 0);
    const recent = pickExamples(rawHistory);

    const isExactDuplicate = (norm: string) => {
      if (!norm) return true;
      if (history.includes(norm)) return true;
      if (norm.length >= EXACT_WINDOW) {
        return history.some(
          (past) =>
            past.length >= EXACT_WINDOW && (past.includes(norm) || norm.includes(past))
        );
      }
      return false;
    };

    const similarityToHistory = (norm: string) => {
      let worst = 0;
      for (const past of history) {
        const score = similarity(norm, past);
        if (score > worst) worst = score;
        if (worst >= DUPLICATE_THRESHOLD) break;
      }
      return worst;
    };

    let review = "";
    let retryFeedback: string | undefined;
    const candidates: Array<{ text: string; score: number }> = [];

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const text = await generateReviewText(
        task.ai_prompt,
        task.app_name,
        recent,
        retryFeedback
      );
      const norm = normalize(text);

      if (isExactDuplicate(norm)) {
        retryFeedback =
          "Your previous output was identical or nearly identical to a review that already exists for this app. Keep following the admin instructions exactly as written, but write a completely different review with a different opening sentence, structure, vocabulary and phrasing.";
        continue;
      }

      const score = similarityToHistory(norm);
      if (score < DUPLICATE_THRESHOLD) {
        review = text;
        break;
      }

      candidates.push({ text, score });
      if (attempt === MAX_GENERATION_ATTEMPTS && candidates.length > 0) {
        // Never leave the user without a review: hand back the least similar
        // candidate instead of failing (the DB guard still blocks verbatim repeats).
        candidates.sort((left, right) => left.score - right.score);
        review = candidates[0].text;
        break;
      }
      retryFeedback =
        "Your previous output repeated or closely imitated a review that already exists for this app. Keep following the admin instructions exactly as written, but rewrite with a completely different opening sentence, structure, vocabulary and phrasing so it cannot be matched to any earlier review.";
    }

    if (!review) {
      throw new ApiError(
        "AI keeps returning a review that already exists, please try again",
        502
      );
    }

    let saveAttempts = 0;
    for (;;) {
      const { error: saveError } = await admin.rpc("save_review_history", {
        p_task_id: task.id,
        p_review: review,
      });
      if (!saveError) break;

      if (/duplicate/i.test(saveError.message) && saveAttempts < MAX_SAVE_ATTEMPTS) {
        saveAttempts += 1;
        const fresh = await generateReviewText(
          task.ai_prompt,
          task.app_name,
          recent,
          "That exact review already exists for this app. Output a completely different review with different wording, opening and structure."
        );
        const norm = normalize(fresh);
        if (norm && !isExactDuplicate(norm)) review = fresh;
        continue;
      }

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
