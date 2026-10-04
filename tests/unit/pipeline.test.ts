// Integration-style test of the photo → candidates pipeline with a stubbed vision result.
import { describe, expect, it } from "vitest";
import { buildCandidate, type CatalogEntry } from "../../supabase/functions/_shared/pipeline.ts";
import { parseVisionOutput } from "../../supabase/functions/_shared/analysis-schema.ts";
import { isOwnImagePath, sniffImageType } from "../../supabase/functions/_shared/image.ts";
import { FOOD_CATALOG } from "../../supabase/catalog/foods.ts";

const catalog: CatalogEntry[] = FOOD_CATALOG.map((f, i) => ({
  ...f, id: `f${i}`, data_source: "nutrisnap_curated", verification: "curated_estimate", saturated_fat_per_100g: null,
}));

const vision = parseVisionOutput({
  is_food: true,
  items: [
    { name: "Idli", alternatives: [], is_beverage: false, quantity: 3, unit: "piece", estimated_weight_g: 120, weight_range_g: [100, 150], visible_ingredients: [], cooking_method: "steamed", confidence: 0.92, uncertainty_notes: null },
    { name: "Sambar", alternatives: ["Rasam"], is_beverage: false, quantity: 1, unit: "bowl", estimated_weight_g: 150, weight_range_g: [120, 200], visible_ingredients: ["drumstick"], cooking_method: null, confidence: 0.8, uncertainty_notes: null },
    { name: "Mystery green paste", alternatives: [], is_beverage: false, quantity: 1, unit: "tbsp", estimated_weight_g: 15, weight_range_g: [10, 20], visible_ingredients: [], cooking_method: null, confidence: 0.3, uncertainty_notes: "Could be mint or coriander chutney" },
  ],
});

describe("photo → nutrition pipeline", () => {
  const cands = vision.result.items.map((i) => buildCandidate(i, catalog));
  it("matches known foods and computes nutrition from the catalog, not the model", () => {
    const idli = cands[0];
    const food = catalog.find((c) => c.id === idli.selectedFoodId)!;
    expect(food.name).toBe("Idli");
    expect(idli.nutrition!.calories_kcal).toBe(Math.round((food.calories_per_100g * 120) / 100));
  });
  it("flags curated estimates as approximate", () => {
    expect(cands[1].reviewReasons.join(" ")).toMatch(/approximation/);
  });
  it("leaves unmatched, low-confidence items for the user with no invented nutrition", () => {
    const m = cands[2];
    expect(m.selectedFoodId).toBeNull();
    expect(m.nutrition).toBeNull();
    expect(m.needsReview).toBe(true);
    expect(m.reviewReasons.join(" ")).toMatch(/mint or coriander/);
  });
  it("prefers a user's personal correction", () => {
    const pongal = catalog.find((c) => c.name === "Ven pongal")!;
    const c = buildCandidate({ ...vision.result.items[0], name: "Khichdi" }, catalog, {
      ai_name: "khichdi", corrected_food_item_id: pongal.id, corrected_name: "Ven pongal", typical_weight_g: 200,
    });
    expect(c.selectedFoodId).toBe(pongal.id);
    expect(c.appliedCorrection).toBe(true);
  });
});

describe("upload validation", () => {
  it("sniffs real image signatures", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("only allows the caller's own folder", () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    expect(isOwnImagePath(`${uid}/meal_1.jpg`, uid)).toBe(true);
    expect(isOwnImagePath(`22222222-2222-2222-2222-222222222222/meal.jpg`, uid)).toBe(false);
    expect(isOwnImagePath(`${uid}/../x.jpg`, uid)).toBe(false);
  });
});
