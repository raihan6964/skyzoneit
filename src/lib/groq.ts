import OpenAI from "openai";
import { ApiError } from "@/lib/error";

function sanitizeReview(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:[-*•]\s+)+/, "");
  text = text.replace(/^\d{1,2}[.)]\s+/, "");
  text = text.replace(/^(?:review|output|result)\s*:\s*/i, "");
  const quoted = text.match(/^(["'“‘])([\s\S]*)(["'”’])$/);
  if (quoted) text = quoted[2].trim();
  return text;
}

export async function generateReviewText(
  adminPrompt: string,
  appName: string,
  recentReviews: string[] = [],
  retryFeedback?: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new ApiError("AI is not configured (missing GROQ_API_KEY)", 503);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  });

  let failure: "empty" | "long" = "empty";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        temperature: 0.9,
        max_tokens: 4096,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: [
              "You are a review-writing engine for a mobile app marketing platform.",
              "",
              "Rules hierarchy: the admin instructions provided by the user are ABSOLUTE. Follow them literally — topic, required phrases, forbidden words, language (English, Bangla, or romanized Banglish), tone, length, sentence count, punctuation, and randomness rules. Your own defaults never override them.",
              "",
              "Output contract:",
              "- Output ONLY the raw review text: one paragraph of plain text.",
              "- No surrounding quotation marks, no headings, no lists, no numbering, no labels, no markdown, no prefixes, no explanations.",
              "- Never mention AI, prompts, instructions, tasks, or tests.",
              "- Sound like a real human user: natural, specific, casual phrasing.",
              "- Examples inside the instructions are style references only — never copy their wording.",
              "- If recent reviews are listed, differ from ALL of them: different opening, structure, and vocabulary.",
              "- If retry feedback is given, fix exactly that problem and output only the corrected review.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `App: ${appName}`,
              "",
              "Admin instructions (follow strictly):",
              adminPrompt,
              ...(recentReviews.length
                ? [
                    "",
                    "Recent reviews already generated for this app (must NOT repeat or closely imitate any of them):",
                    ...recentReviews.map((r, i) => `${i + 1}. ${r.slice(0, 200)}`),
                  ]
                : []),
              ...(retryFeedback ? ["", `Retry feedback: ${retryFeedback}`] : []),
              "",
              "Write the review now.",
            ].join("\n"),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "";
      const text = sanitizeReview(raw);
      if (text && text.length <= 1200) return text;
      failure = text ? "long" : "empty";
    } catch (error) {
      if (attempt === 2) {
        const message =
          error instanceof Error ? error.message : "AI request failed";
        throw new ApiError(`AI request failed: ${message}`, 502);
      }
    }
  }

  throw failure === "empty"
    ? new ApiError("AI returned an empty review", 502)
    : new ApiError("AI returned an unusually long response, please try again", 502);
}

export interface AccessTestGrade {
  pass: boolean;
  failed: string[];
}

export async function gradeAccessTest(
  correct: Record<string, string>,
  answers: Record<string, string>
): Promise<AccessTestGrade> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new ApiError("AI is not configured (missing GROQ_API_KEY)", 503);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  });

  const system = [
    "You grade a 5-question access test for new users of a gig-work platform.",
    "The reference answers were written by the site owner. Users answer in Bangla (Bengali script), Banglish (romanized Bengali), or English — all three languages are equally valid. Judge MEANING only; never fail an answer because it is in a different language than the reference. Casual wording, typos and mixed languages are normal.",
    "Be lenient on wording, strict on meaning: a vague, evasive, empty, gibberish, or clearly wrong answer must FAIL. A wrong fact must FAIL even if phrased confidently.",
    "Bangla digits count: ৩ = 3, ৫০ = 50.",
    "For the yes/no question pass only a clear affirmative (হ্যাঁ, ha, ji, he, hea, yes, দেখেছি, dekhechi...); maybe or non-answers fail.",
    "Output ONLY minified JSON with no markdown fences and no commentary:",
    '{"pass":true|false,"failed":["<question id>", ...]}',
    "failed must contain EVERY failed question id as a plain string (empty array if all pass). pass must be true only when failed is empty.",
    "Return question ids ONLY — never include explanations, hints, reasons or any other text.",
  ].join("\n");

  const userContent = JSON.stringify({
    reference_answers: correct,
    user_answers: answers,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        temperature: 0,
        max_tokens: 2000,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      });

      const raw = (response.choices[0]?.message?.content ?? "").trim();
      const cleaned = raw
        .replace(/^```[a-zA-Z]*\s*/, "")
        .replace(/\s*```$/, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end <= start) continue;

      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        pass?: unknown;
        failed?: unknown;
      };
      if (typeof parsed.pass !== "boolean" || !Array.isArray(parsed.failed)) {
        continue;
      }

      const failed = (parsed.failed as unknown[])
        .filter((item): item is string => typeof item === "string")
        .slice(0, 20);

      return { pass: parsed.pass === true && failed.length === 0, failed };
    } catch (error) {
      if (attempt === 2) {
        const message =
          error instanceof Error ? error.message : "AI request failed";
        throw new ApiError(`AI verification failed: ${message}`, 502);
      }
    }
  }

  throw new ApiError(
    "AI verification returned an invalid response, please try again",
    502
  );
}
