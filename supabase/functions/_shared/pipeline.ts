/**
 * Pure post-processing of the vision result: match each identified item to a
 * catalog food and compute nutrition from the catalog (never from the model).
 */
import type { VisionItem } from "./analysis-schema.ts";
import { LOW_CONFIDENCE } from "./analysis-schema.ts";
import { rankMatches } from "./matching.ts";
import { calculateNutrition, type NutrientTotals, type Per100g, MAX_SERVING_WEIGHT_G } from "./nutrition.ts";

export interface CatalogEntry extends Per100g {
  id: string;
  name: string;
  alternate_names: string[];
  serving_description: string;
  serving_weight_g: number;
  data_source: string;
  verification: string;
}

export interface Correction { ai_name: string; corrected_food_item_id: string | null; corrected_name: string; typical_weight_g: number | null }

export interface Candidate {
  ai: VisionItem;
  matches: { food: CatalogEntry; score: number }[];
  selectedFoodId: string | null;
  weightG: number;
  nutrition: NutrientTotals | null;
  needsReview: boolean;
  reviewReasons: string[];
  appliedCorrection: boolean;
}

export const MATCH_THRESHOLD = 0.5;

export function buildCandidate(ai: VisionItem, catalog: CatalogEntry[], correction?: Correction): Candidate {
  const reasons: string[] = [];
  let matches = rankMatches(ai.name, catalog, 0.34, 3);
  for (const alt of ai.alternatives) {
    for (const m of rankMatches(alt, catalog, 0.5, 2)) {
      if (!matches.some((x) => x.food.id === m.food.id)) matches.push({ food: m.food, score: m.score * 0.9 });
    }
  }
  let applied = false;
  if (correction?.corrected_food_item_id) {
    const f = catalog.find((c) => c.id === correction.corrected_food_item_id);
    if (f) {
      matches = [{ food: f, score: 1 }, ...matches.filter((m) => m.food.id !== f.id)];
      applied = true;
    }
  }
  matches.sort((a, b) => b.score - a.score);
  matches = matches.slice(0, 4);

  const best = matches[0];
  const selected = best && best.score >= MATCH_THRESHOLD ? best.food : null;
  const weightG = Math.min(MAX_SERVING_WEIGHT_G, Math.max(1, Math.round(ai.estimated_weight_g)));

  if (!selected) reasons.push("No reliable nutrition match — choose a food or enter it manually.");
  if (ai.confidence < LOW_CONFIDENCE) reasons.push("The AI is unsure what this is.");
  if (ai.uncertainty_notes) reasons.push(ai.uncertainty_notes);
  if (selected && selected.verification !== "verified_source") reasons.push("Nutrition values are an approximation for a typical recipe.");

  return {
    ai,
    matches,
    selectedFoodId: selected?.id ?? null,
    weightG,
    nutrition: selected ? calculateNutrition(selected, weightG) : null,
    needsReview: !selected || ai.confidence < LOW_CONFIDENCE,
    reviewReasons: reasons,
    appliedCorrection: applied,
  };
}
