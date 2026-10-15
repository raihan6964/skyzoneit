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
const MAX_ROUNDS = 8;
const DUPLICATE_THRESHOLD = 0.7;
const EXACT_WINDOW = 40;

const VARIATION_HINTS = [
  "Pick a reference or core idea that none of the recent reviews listed above appear to be based on.",
  "If your first instinct matches a recent review, switch to a completely different reference or idea.",
  "Choose the least-used looking idea from the admin's pool rather than the most obvious one.",
  "Write it exactly as a casual real user would — natural words, nothing forced or word-swapped.",
  "Vary the rhythm and opening (short punchy start vs a fuller sentence), keeping the wording natural.",
];

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

    const loadHistory = async () => {
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
      return {
        norms: raw.map(normalize).filter((entry) => entry.length > 0),
        recent: pickExamples(raw),
      };
    };

    let { norms: history, recent } = await loadHistory();

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

    let feedback: string | undefined;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const hint = VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];
      const text = await generateReviewText(
        task.ai_prompt,
        task.app_name,
        recent,
        feedback,
        hint
      );
      const norm = normalize(text);

      if (isExactDuplicate(norm)) {
        feedback =
          "Your previous output was identical or nearly identical to a review that already exists for this app. Do not word-swap an existing phrasing. Instead pick a different reference or core idea from the admin's pool (one the recent reviews do not appear to be based on) and write it naturally from scratch, following the admin instructions exactly.";
        continue;
      }

      const score = similarityToHistory(norm);
      if (score >= DUPLICATE_THRESHOLD && round < MAX_ROUNDS) {
        feedback = `Your previous output was too similar to an existing review for this app (similarity ${score.toFixed(2)}). Do not swap individual words or change the subject to escape the match — choose a different reference or core idea from the admin's pool and write it naturally, following the admin instructions exactly.`;
        continue;
      }

      const { error: claimError } = await admin.rpc("save_review_history", {
        p_task_id: task.id,
        p_review: text,
      });
      if (!claimError) return Response.json({ review: text });

      console.error("review claim failed:", claimError.message);
      const rejected = /duplicate|similar/i.test(claimError.message);
      if (rejected && round < MAX_ROUNDS) {
        // Another user may have claimed a matching review moments ago —
        // reload so the next attempt avoids the fresh wording too.
        const fresh = await loadHistory();
        history = fresh.norms;
        recent = fresh.recent;
        feedback =
          "Another user just claimed a very similar (or identical) review for this app, so yours was rejected as too close to an existing one. Pick a different reference or core idea from the admin's pool and write it naturally — do not rearrange or word-swap the same phrasing, and do not change the subject.";
        continue;
      }
      if (rejected) break;

      throw new ApiError(
        "Could not record the generated review, please try again",
        502
      );
    }

    throw new ApiError(
      "AI keeps returning a review that already exists, please try again",
      502
    );
  });
}
