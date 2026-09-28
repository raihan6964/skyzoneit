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
      temperature: 0.95,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You write unique, realistic mobile app store reviews in natural human style. Output ONLY the review text itself: no quotation marks, no headings, no labels, no explanations. Never repeat the same phrasing twice. Write in English, 2-6 sentences, mention concrete believable details.",
        },
        {
          role: "user",
          content: `App: ${appName}\n\nInstructions:\n${adminPrompt}`,
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
