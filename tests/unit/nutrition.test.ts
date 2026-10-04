import { describe, expect, it } from "vitest";
import {
  atwaterConsistent, calculateNutrition, isValidPer100g, scaleNutrient, servingToGrams, sumNutrients,
} from "../../supabase/functions/_shared/nutrition.ts";
import { FOOD_CATALOG } from "../../supabase/catalog/foods.ts";

const rice = {
  calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3,
  fiber_per_100g: 0.4, sugar_per_100g: null,
};

describe("calculateNutrition", () => {
  it("applies per-100 g × weight / 100", () => {
    const n = calculateNutrition(rice, 160);
    expect(n.calories_kcal).toBe(208);
    expect(n.protein_g).toBe(4.3);
    expect(n.carbs_g).toBe(44.8);
    expect(n.fat_g).toBe(0.5);
    expect(n.fiber_g).toBe(0.6);
  });
  it("keeps unknown nutrients unknown rather than zero", () => {
    expect(calculateNutrition(rice, 100).sugar_g).toBeNull();
    expect(scaleNutrient(undefined, 50)).toBeNull();
  });
  it("is linear in weight", () => {
    const a = calculateNutrition(rice, 50), b = calculateNutrition(rice, 100);
    expect(b.calories_kcal).toBe(a.calories_kcal * 2);
  });
  it("rejects invalid weights", () => {
    expect(() => calculateNutrition(rice, 0)).toThrow(RangeError);
    expect(() => calculateNutrition(rice, -5)).toThrow(RangeError);
    expect(() => calculateNutrition(rice, Number.NaN)).toThrow(RangeError);
    expect(() => calculateNutrition(rice, 99999)).toThrow(RangeError);
  });
});

describe("servingToGrams", () => {
  it("multiplies household servings", () => {
    expect(servingToGrams(3, 40)).toBe(120);
    expect(servingToGrams(1.5, 85)).toBe(127.5);
  });
  it("rejects zero quantity", () => expect(() => servingToGrams(0, 40)).toThrow());
});

describe("sumNutrients", () => {
  it("sums required fields and flags partial optional fields", () => {
    const s = sumNutrients([
      { calories_kcal: 100, protein_g: 2, carbs_g: 10, fat_g: 1, fiber_g: 1.5, sugar_g: null },
      { calories_kcal: 250.4, protein_g: 3.3, carbs_g: 20, fat_g: 4, fiber_g: null, sugar_g: null },
    ]);
    expect(s.calories_kcal).toBe(350);
    expect(s.protein_g).toBe(5.3);
    expect(s.fiber_g).toBe(1.5);
    expect(s.partial.fiber_g).toBe(true);
    expect(s.sugar_g).toBeNull();
  });
  it("returns zeros for an empty meal", () => {
    expect(sumNutrients([]).calories_kcal).toBe(0);
  });
});

describe("catalog data quality", () => {
  it.each(FOOD_CATALOG.map((f) => [f.name, f] as const))("%s has plausible values", (_n, f) => {
    expect(isValidPer100g(f)).toBe(true);
    expect(atwaterConsistent(f)).toBe(true);
    expect(f.serving_weight_g).toBeGreaterThan(0);
  });
  it("has unique names", () => {
    const names = FOOD_CATALOG.map((f) => f.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
  it("covers the required Indian staples", () => {
    const all = FOOD_CATALOG.flatMap((f) => [f.name, ...f.alternate_names].map((s) => s.toLowerCase()));
    for (const k of ["idli", "dosa", "sambar", "rasam", "rice", "curd rice", "chapati", "parotta", "biryani", "pongal", "upma", "poori", "vada", "dal", "paneer", "chicken curry"]) {
      expect(all.some((n) => n.includes(k)), k).toBe(true);
    }
  });
});
