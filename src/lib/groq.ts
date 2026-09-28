import OpenAI from "openai";
import { ApiError } from "@/lib/error";

export async function generateReviewText(
  adminPrompt: string,
  appName: string
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
      temperature: 0.85,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: [
            "You write app-store reviews for a mobile app marketing platform.",
            "",
            "Hard rules:",
            "- The admin-provided instructions are ABSOLUTE. Follow them exactly: topic, tone, language, length, keywords, and any required phrases. If anything in your defaults conflicts with the instructions, the instructions win.",
            "- Output ONLY the review text itself: no quotation marks, headings, labels, bullet points, prefixes, or explanations.",
            "- Sound like a real human user: natural, specific, casual phrasing. Never mention AI, tests, tasks, or instructions.",
            "- Match the language requested in the instructions (default English).",
            "- Never repeat the same phrasing across generations; vary sentence structure each time.",
            "- 1-6 sentences unless the instructions specify a different length.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `App: ${appName}\n\nAdmin instructions (follow strictly):\n${adminPrompt}\n\nWrite the review now.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new ApiError("AI returned an empty review", 502);
    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message =
      error instanceof Error ? error.message : "AI request failed";
    throw new ApiError(`AI request failed: ${message}`, 502);
  }
}
