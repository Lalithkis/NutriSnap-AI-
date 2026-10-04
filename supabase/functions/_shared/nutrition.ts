/**
 * Pure nutrition arithmetic shared by the mobile app and the edge functions.
 * No platform imports: this file must run under Node (tests), Metro and Deno.
 *
 * Core rule: nutrient amount = nutrient value per 100 g × serving weight (g) / 100.
 */

export interface Per100g {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_mg_per_100g?: number | null;
  saturated_fat_per_100g?: number | null;
}

export interface NutrientTotals {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
}

export const MAX_SERVING_WEIGHT_G = 5000;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scale one per-100 g value. Null stays null: unknown is never turned into 0. */
export function scaleNutrient(per100g: number | null | undefined, weightG: number): number | null {
  if (per100g === null || per100g === undefined || !Number.isFinite(per100g)) return null;
  return round1((per100g * weightG) / 100);
}

export function assertValidWeight(weightG: number): void {
  if (!Number.isFinite(weightG) || weightG <= 0 || weightG > MAX_SERVING_WEIGHT_G) {
    throw new RangeError(`Serving weight must be between 0 and ${MAX_SERVING_WEIGHT_G} g (got ${weightG})`);
  }
}

export function calculateNutrition(food: Per100g, weightG: number): NutrientTotals {
  assertValidWeight(weightG);
  return {
    calories_kcal: Math.round((food.calories_per_100g * weightG) / 100),
    protein_g: scaleNutrient(food.protein_per_100g, weightG) ?? 0,
    carbs_g: scaleNutrient(food.carbs_per_100g, weightG) ?? 0,
    fat_g: scaleNutrient(food.fat_per_100g, weightG) ?? 0,
    fiber_g: scaleNutrient(food.fiber_per_100g, weightG),
    sugar_g: scaleNutrient(food.sugar_per_100g, weightG),
    sodium_mg: scaleNutrient(food.sodium_mg_per_100g, weightG),
    saturated_fat_g: scaleNutrient(food.saturated_fat_per_100g, weightG),
  };
}

/** Weight in grams for a quantity of a household serving (e.g. 2 × "1 idli" of 39 g). */
export function servingToGrams(quantity: number, servingWeightG: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError("Quantity must be positive");
  if (!Number.isFinite(servingWeightG) || servingWeightG <= 0) throw new RangeError("Serving weight must be positive");
  return round1(quantity * servingWeightG);
}

type Summable = Partial<Record<keyof NutrientTotals, number | null>>;

/**
 * Sum item totals. Optional nutrients become null only if *every* item lacks them;
 * otherwise `partial` flags that the sum omits unknown values.
 */
export function sumNutrients(items: Summable[]): NutrientTotals & { partial: Partial<Record<keyof NutrientTotals, boolean>> } {
  const keys: (keyof NutrientTotals)[] = [
    "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "saturated_fat_g",
  ];
  const out = {} as NutrientTotals;
  const partial: Partial<Record<keyof NutrientTotals, boolean>> = {};
  for (const k of keys) {
    const known = items.map((i) => i[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const required = k === "calories_kcal" || k === "protein_g" || k === "carbs_g" || k === "fat_g";
    if (known.length === 0) {
      (out[k] as number | null) = required ? 0 : null;
    } else {
      const s = known.reduce((a, b) => a + b, 0);
      (out[k] as number) = k === "calories_kcal" ? Math.round(s) : round1(s);
    }
    if (known.length > 0 && known.length < items.length) partial[k] = true;
  }
  return { ...out, partial };
}

/**
 * Sanity check: Atwater energy (4/4/9 kcal per g) should roughly match the stated
 * calories. Large mismatches indicate bad source data or a unit error.
 */
export function atwaterConsistent(food: Pick<Per100g, "calories_per_100g" | "protein_per_100g" | "carbs_per_100g" | "fat_per_100g">, tolerance = 0.25): boolean {
  const est = food.protein_per_100g * 4 + food.carbs_per_100g * 4 + food.fat_per_100g * 9;
  if (food.calories_per_100g === 0) return est < 5;
  // Alcohol and polyols break the 4/4/9 rule; allow a small absolute slack too.
  return Math.abs(est - food.calories_per_100g) <= Math.max(15, food.calories_per_100g * tolerance);
}

export function isValidPer100g(food: Per100g): boolean {
  const { calories_per_100g: c, protein_per_100g: p, carbs_per_100g: cb, fat_per_100g: f } = food;
  if ([c, p, cb, f].some((v) => !Number.isFinite(v) || v < 0)) return false;
  if (c > 902) return false; // pure fat is ~900 kcal/100 g
  if (p + cb + f > 100.5) return false;
  return true;
}
