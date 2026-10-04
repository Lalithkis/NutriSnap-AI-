import { describe, expect, it } from "vitest";
import { parseVisionOutput, VISION_JSON_SCHEMA } from "../../supabase/functions/_shared/analysis-schema.ts";
import { matchScore, normalizeName, rankMatches } from "../../supabase/functions/_shared/matching.ts";

const good = {
  name: "Idli", alternatives: ["Rava idli"], is_beverage: false, quantity: 3, unit: "piece",
  estimated_weight_g: 120, weight_range_g: [100, 150], visible_ingredients: [], cooking_method: "steamed",
  confidence: 0.85, uncertainty_notes: null,
};

describe("parseVisionOutput", () => {
  it("accepts valid output", () => {
    const { result, droppedItems } = parseVisionOutput({ is_food: true, items: [good], clarification_questions: [], overall_notes: null });
    expect(result.items).toHaveLength(1);
    expect(droppedItems).toBe(0);
  });
  it("accepts a JSON string", () => {
    expect(parseVisionOutput(JSON.stringify({ is_food: true, items: [good] })).result.items[0].name).toBe("Idli");
  });
  it("drops malformed items but keeps good ones", () => {
    const { result, droppedItems } = parseVisionOutput({
      is_food: true,
      items: [good, { ...good, estimated_weight_g: -3 }, { name: "" }, { ...good, confidence: 7 }],
    });
    expect(result.items).toHaveLength(1);
    expect(droppedItems).toBe(3);
  });
  it("discards inconsistent weight ranges", () => {
    const { result } = parseVisionOutput({ is_food: true, items: [{ ...good, weight_range_g: [200, 300] }] });
    expect(result.items[0].weight_range_g).toBeUndefined();
  });
  it("throws on totally malformed output", () => {
    expect(() => parseVisionOutput("not json")).toThrow();
    expect(() => parseVisionOutput({ foo: 1 })).toThrow();
  });
  it("JSON schema requires every zod field", () => {
    expect([...VISION_JSON_SCHEMA.properties.items.items.required].sort()).toEqual(Object.keys(good).sort());
  });
});

describe("food matching", () => {
  const catalog = [
    { id: "1", name: "Plain dosa", alternate_names: ["dosa", "dosai"] },
    { id: "2", name: "Masala dosa", alternate_names: [] },
    { id: "3", name: "Idli", alternate_names: ["idly"] },
    { id: "4", name: "Cooked white rice", alternate_names: ["rice", "steamed rice"] },
  ];
  it("normalizes names", () => expect(normalizeName("A Bowl of Steamed Rice!")).toBe("steamed rice"));
  it("exact alias match scores 1", () => expect(matchScore("idly", catalog[2])).toBe(1));
  it("plural forms match", () => expect(rankMatches("Idlis", catalog)[0].food.id).toBe("3"));
  it("ranks the specific dish first", () => expect(rankMatches("masala dosa", catalog)[0].food.id).toBe("2"));
  it("returns nothing for unknown food", () => expect(rankMatches("quinoa tabbouleh", catalog)).toHaveLength(0));
});
