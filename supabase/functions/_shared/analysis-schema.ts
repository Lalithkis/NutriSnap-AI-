/**
 * Schema for the vision model's structured output. The model only *identifies*
 * foods and estimates portions; it never supplies nutrition numbers we trust.
 */
import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner", "other"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const VisionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  alternatives: z.array(z.string().trim().min(1).max(120)).max(4).default([]),
  is_beverage: z.boolean().default(false),
  quantity: z.number().positive().max(50),
  unit: z.string().trim().min(1).max(40),
  estimated_weight_g: z.number().positive().max(3000),
  weight_range_g: z.tuple([z.number().nonnegative(), z.number().positive()]).optional(),
  visible_ingredients: z.array(z.string().trim().max(60)).max(15).default([]),
  cooking_method: z.string().trim().max(60).nullable().default(null),
  confidence: z.number().min(0).max(1),
  uncertainty_notes: z.string().trim().max(400).nullable().default(null),
});

export const VisionResultSchema = z.object({
  is_food: z.boolean(),
  items: z.array(VisionItemSchema).max(20),
  clarification_questions: z.array(z.string().trim().max(240)).max(5).default([]),
  overall_notes: z.string().trim().max(600).nullable().default(null),
});

export type VisionItem = z.infer<typeof VisionItemSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;

/** JSON Schema handed to the model via structured outputs (kept in sync with the zod schema by tests). */
export const VISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "items", "clarification_questions", "overall_notes"],
  properties: {
    is_food: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "alternatives", "is_beverage", "quantity", "unit", "estimated_weight_g",
          "weight_range_g", "visible_ingredients", "cooking_method", "confidence", "uncertainty_notes",
        ],
        properties: {
          name: { type: "string" },
          alternatives: { type: "array", items: { type: "string" } },
          is_beverage: { type: "boolean" },
          quantity: { type: "number" },
          unit: { type: "string" },
          estimated_weight_g: { type: "number" },
          weight_range_g: { type: "array", items: { type: "number" } },
          visible_ingredients: { type: "array", items: { type: "string" } },
          cooking_method: { type: ["string", "null"] },
          confidence: { type: "number" },
          uncertainty_notes: { type: ["string", "null"] },
        },
      },
    },
    clarification_questions: { type: "array", items: { type: "string" } },
    overall_notes: { type: ["string", "null"] },
  },
} as const;

export const LOW_CONFIDENCE = 0.6;

/**
 * Parse untrusted model output. Malformed items are dropped individually rather
 * than failing the whole meal; a fully malformed payload throws.
 */
export function parseVisionOutput(raw: unknown): { result: VisionResult; droppedItems: number } {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  const shell = z
    .object({
      is_food: z.boolean(),
      items: z.array(z.unknown()),
      clarification_questions: z.array(z.unknown()).optional(),
      overall_notes: z.unknown().optional(),
    })
    .parse(obj);
  const items: VisionItem[] = [];
  let dropped = 0;
  for (const it of shell.items.slice(0, 20)) {
    const r = VisionItemSchema.safeParse(it);
    if (!r.success) { dropped++; continue; }
    const item = { ...r.data };
    if (item.weight_range_g) {
      const [lo, hi] = item.weight_range_g;
      if (lo > hi || item.estimated_weight_g < lo || item.estimated_weight_g > hi) item.weight_range_g = undefined;
    }
    items.push(item);
  }
  const questions = (shell.clarification_questions ?? [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim().slice(0, 240))
    .slice(0, 5);
  const notes = typeof shell.overall_notes === "string" ? shell.overall_notes.slice(0, 600) : null;
  return { result: { is_food: shell.is_food, items, clarification_questions: questions, overall_notes: notes }, droppedItems: dropped };
}
