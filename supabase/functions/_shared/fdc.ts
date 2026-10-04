/**
 * USDA FoodData Central lookup (https://fdc.nal.usda.gov/api-guide).
 * Requires FDC_API_KEY. Results are cached into public.food_items with provenance.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidPer100g } from "./nutrition.ts";

const NUTRIENT_IDS = {
  energy: [1008, 2047, 2048], // kcal (Energy, Atwater general, Atwater specific)
  protein: [1003],
  carbs: [1005],
  fat: [1004],
  fiber: [1079],
  sugar: [2000, 1063],
  sodium: [1093],
  satfat: [1258],
};

interface FdcNutrient { nutrientId?: number; nutrientNumber?: string; unitName?: string; value?: number }
interface FdcFood { fdcId: number; description: string; dataType: string; foodNutrients: FdcNutrient[]; servingSize?: number; servingSizeUnit?: string }

function pick(ns: FdcNutrient[], ids: number[], unit?: string): number | null {
  for (const id of ids) {
    const n = ns.find((x) => x.nutrientId === id && (!unit || x.unitName?.toUpperCase() === unit));
    if (n && typeof n.value === "number" && Number.isFinite(n.value)) return n.value;
  }
  return null;
}

export async function searchFdc(query: string, apiKey: string, timeoutMs = 8000): Promise<FdcFood[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, pageSize: 8, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"] }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const body = await res.json() as { foods?: FdcFood[] };
    return body.foods ?? [];
  } catch {
    return []; // provider unavailable → caller falls back to the local catalog / manual entry
  } finally {
    clearTimeout(t);
  }
}

/** Convert FDC foods (values are per 100 g for these data types) and upsert into the cache. */
export async function cacheFdcFoods(admin: SupabaseClient, foods: FdcFood[]) {
  const rows = foods.flatMap((f) => {
    const row = {
      name: f.description.length > 120 ? f.description.slice(0, 117) + "..." : f.description,
      alternate_names: [] as string[],
      category: "usda",
      cuisine: "international",
      serving_description: "100 g",
      serving_weight_g: 100,
      calories_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.energy, "KCAL"),
      protein_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.protein),
      carbs_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.carbs),
      fat_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.fat),
      fiber_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.fiber),
      sugar_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.sugar),
      sodium_mg_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.sodium),
      saturated_fat_per_100g: pick(f.foodNutrients, NUTRIENT_IDS.satfat),
      data_source: "usda_fdc",
      external_source_id: String(f.fdcId),
      verification: "verified_source",
      preparation_notes: `USDA FoodData Central (${f.dataType}) fdcId ${f.fdcId}`,
    };
    // Skip entries without the core macros instead of inventing zeros.
    if ([row.calories_per_100g, row.protein_per_100g, row.carbs_per_100g, row.fat_per_100g].some((v) => v === null)) return [];
    const full = row as typeof row & { calories_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number };
    return isValidPer100g(full) ? [full] : [];
  });
  if (rows.length === 0) return [];
  const { data, error } = await admin.from("food_items").upsert(rows, { onConflict: "data_source,external_source_id" }).select("*");
  if (error) throw error;
  return data ?? [];
}
