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

  try {
    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.9,
      max_tokens: 500,
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

    const text = sanitizeReview(response.choices[0]?.message?.content ?? "");
    if (!text) throw new ApiError("AI returned an empty review", 502);
    if (text.length > 1200) {
      throw new ApiError("AI returned an unusually long response, please try again", 502);
    }
    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message =
      error instanceof Error ? error.message : "AI request failed";
    throw new ApiError(`AI request failed: ${message}`, 502);
  }
}
