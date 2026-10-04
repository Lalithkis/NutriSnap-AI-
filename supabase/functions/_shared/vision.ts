/**
 * Vision step: identify foods and estimate portions from a photo with Claude.
 * The model returns structured JSON (no nutrition numbers); everything is
 * re-validated with zod before use.
 */
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.ts";
import { parseVisionOutput, VISION_JSON_SCHEMA, type VisionResult } from "./analysis-schema.ts";

export const DEFAULT_VISION_MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the food-recognition step of a nutrition tracking app.
Identify every distinct food and drink visible in the photo and estimate portions. Another system looks up nutrition values, so do not estimate calories or nutrients.

Guidance:
- List each item separately (e.g. idli, sambar and coconut chutney are three items). Sauces, chutneys, dips and beverages count as items when visible.
- Use common dish names, including regional Indian names where appropriate (e.g. "Ven pongal", "Kerala parotta"). Give up to 4 plausible alternatives when the dish is ambiguous.
- quantity + unit should be a household measure (e.g. 3 × "piece", 1 × "cup", 1 × "bowl"); estimated_weight_g is your best estimate of the edible weight in grams (for drinks, ml ≈ g), and weight_range_g is a realistic [low, high] range.
- Photos cannot reveal exact weight, hidden ingredients, or cooking oil. Lower confidence accordingly and explain in uncertainty_notes (e.g. "oil content unknown", "portion partly hidden").
- confidence is 0–1 for the identification. Use < 0.6 when you are genuinely unsure.
- Ask clarification_questions only when the answer would change the result materially (e.g. "Is the drink sweetened?").
- If the image does not show food, set is_food to false and return no items.`;

export async function analyzeImage(args: {
  apiKey: string;
  model?: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  mealHint?: string;
  personalHints?: string[];
}): Promise<{ result: VisionResult; droppedItems: number; model: string }> {
  const client = new Anthropic({ apiKey: args.apiKey, timeout: 90_000, maxRetries: 2 });
  const model = args.model ?? DEFAULT_VISION_MODEL;
  const hints = [
    args.mealHint ? `The user is logging this as: ${args.mealHint}.` : "",
    args.personalHints?.length ? `This user has previously corrected these identifications: ${args.personalHints.join("; ")}.` : "",
  ].filter(Boolean).join("\n");

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: VISION_JSON_SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: args.mediaType, data: args.imageBase64 } },
          { type: "text", text: (hints ? hints + "\n" : "") + "Identify the foods in this photo." },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "ai_rate_limited", "The AI service is busy. Please try again in a minute.", 60);
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "ai_not_configured", "The AI service is not configured correctly.");
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, "ai_timeout", "The AI service took too long. Please try again.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "ai_unavailable", "The AI service is unavailable right now. You can add foods manually.");
    throw e;
  }

  if (message.stop_reason === "refusal") throw new HttpError(422, "ai_refused", "This image couldn't be analysed. Please add foods manually.");
  if (message.stop_reason === "max_tokens") throw new HttpError(502, "ai_malformed", "The AI response was incomplete. Please retry.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const parsed = parseVisionOutput(text);
    return { ...parsed, model: message.model };
  } catch {
    throw new HttpError(502, "ai_malformed", "The AI returned an unreadable result. Please retry or add foods manually.");
  }
}
