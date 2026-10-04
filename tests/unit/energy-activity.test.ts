import { describe, expect, it } from "vitest";
import { ageFromDob, estimateEnergy, mifflinStJeor, MIN_TARGET_KCAL, defaultWaterTargetMl, cmToFtIn, ftInToCm, kgToLb, lbToKg } from "../../supabase/functions/_shared/energy.ts";
import { dedupeActivities, estimateActivityKcal } from "../../supabase/functions/_shared/activity.ts";

describe("energy estimates", () => {
  const adult = { ageYears: 30, sex: "male" as const, heightCm: 175, weightKg: 70, activityLevel: "moderate" as const, goal: "maintain" as const };
  it("matches Mifflin–St Jeor", () => {
    expect(mifflinStJeor(adult)).toBeCloseTo(10 * 70 + 6.25 * 175 - 150 + 5);
    expect(mifflinStJeor({ ...adult, sex: "female" })).toBeCloseTo(10 * 70 + 6.25 * 175 - 150 - 161);
  });
  it("maintenance target ≈ TDEE", () => {
    const e = estimateEnergy(adult);
    expect(Math.abs(e.targetKcal - e.tdeeKcal)).toBeLessThanOrEqual(5);
    expect(e.proteinG * 4 + e.carbsG * 4 + e.fatG * 9).toBeGreaterThan(e.targetKcal - 20);
  });
  it("caps weight-loss deficit at 500 kcal", () => {
    const e = estimateEnergy({ ...adult, goal: "lose_gradual" });
    expect(e.tdeeKcal - e.targetKcal).toBeLessThanOrEqual(505);
  });
  it("never goes below the safety floor", () => {
    const e = estimateEnergy({ ageYears: 60, sex: "female", heightCm: 150, weightKg: 48, activityLevel: "sedentary", goal: "lose_gradual" });
    expect(e.targetKcal).toBeGreaterThanOrEqual(MIN_TARGET_KCAL.female);
  });
  it("disables deficits for minors and pregnancy", () => {
    const minor = estimateEnergy({ ...adult, ageYears: 16, goal: "lose_gradual" });
    expect(minor.requiresClinician).toBe(true);
    expect(minor.targetKcal).toBeGreaterThanOrEqual(minor.tdeeKcal - 5);
    const preg = estimateEnergy({ ...adult, sex: "female", goal: "lose_gradual", pregnantOrBreastfeeding: true });
    expect(preg.requiresClinician).toBe(true);
    expect(preg.warnings.join(" ")).toMatch(/clinician/);
  });
  it("disables deficits when underweight", () => {
    const e = estimateEnergy({ ...adult, weightKg: 50, goal: "lose_gradual" });
    expect(e.targetKcal).toBeGreaterThanOrEqual(e.tdeeKcal - 5);
  });
  it("computes age from DOB", () => {
    expect(ageFromDob("2000-06-15", new Date("2026-06-14T12:00:00"))).toBe(25);
    expect(ageFromDob("2000-06-15", new Date("2026-06-15T12:00:00"))).toBe(26);
  });
  it("unit conversions round-trip", () => {
    expect(lbToKg(kgToLb(70))).toBeCloseTo(70, 0);
    const { ft, in: i } = cmToFtIn(180);
    expect(ftInToCm(ft, i)).toBeCloseTo(180, -1);
    expect(defaultWaterTargetMl(70)).toBe(2250);
  });
});

describe("activity energy", () => {
  it("uses MET × kg × hours", () => {
    expect(estimateActivityKcal("running", "moderate", 30, 70)).toBe(Math.round(9.8 * 70 * 0.5));
  });
  it("returns null without body weight instead of guessing", () => {
    expect(estimateActivityKcal("walking", "light", 30, null)).toBeNull();
  });
  it("rejects bad durations", () => {
    expect(() => estimateActivityKcal("walking", "light", 0, 70)).toThrow();
  });
  it("removes manual duplicates of imported workouts", () => {
    const { kept, duplicates } = dedupeActivities([
      { id: "m", activity_type: "running", started_at: "2026-10-04T06:05:00Z", duration_minutes: 30, calories_burned_kcal: 300, source: "manual" },
      { id: "h", activity_type: "running", started_at: "2026-10-04T06:00:00Z", duration_minutes: 32, calories_burned_kcal: 320, source: "health_connect" },
      { id: "w", activity_type: "walking", started_at: "2026-10-04T18:00:00Z", duration_minutes: 20, calories_burned_kcal: 80, source: "manual" },
    ]);
    expect(kept.map((k) => k.id)).toEqual(["h", "w"]);
    expect(duplicates.map((d) => d.id)).toEqual(["m"]);
  });
  it("keeps two separate manual workouts of the same type", () => {
    const { kept } = dedupeActivities([
      { id: "a", activity_type: "walking", started_at: "2026-10-04T06:00:00Z", duration_minutes: 30, calories_burned_kcal: 100, source: "manual" },
      { id: "b", activity_type: "walking", started_at: "2026-10-04T06:10:00Z", duration_minutes: 30, calories_burned_kcal: 100, source: "manual" },
    ]);
    expect(kept).toHaveLength(2);
  });
});
