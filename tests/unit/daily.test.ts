import { describe, expect, it } from "vitest";
import { addDays, computeDailySummary, localDayBounds, toLocalDate } from "../../supabase/functions/_shared/daily.ts";

describe("local day boundaries", () => {
  it("handles IST (+05:30)", () => {
    const { start, end } = localDayBounds("2026-10-04", "Asia/Kolkata");
    expect(start.toISOString()).toBe("2026-10-03T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-04T18:30:00.000Z");
  });
  it("handles DST spring-forward (23 h day)", () => {
    const { start, end } = localDayBounds("2026-03-08", "America/New_York");
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });
  it("handles DST fall-back (25 h day)", () => {
    const { start, end } = localDayBounds("2026-11-01", "America/New_York");
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
  });
  it("maps instants to local dates", () => {
    expect(toLocalDate("2026-10-03T19:00:00Z", "Asia/Kolkata")).toBe("2026-10-04");
    expect(toLocalDate("2026-10-03T19:00:00Z", "UTC")).toBe("2026-10-03");
  });
  it("adds days across months", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
});

const item = (cal: number, p = 0, c = 0, f = 0) => ({ calories_kcal: cal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: null, sugar_g: null });

describe("computeDailySummary", () => {
  const base = {
    date: "2026-10-04",
    meals: [
      { id: "1", logged_at: "", meal_type: "breakfast", analysis_status: "confirmed", meal_items: [item(300, 10, 50, 5), item(100, 2, 5, 8)] },
      { id: "2", logged_at: "", meal_type: "lunch", analysis_status: "saved_unconfirmed", meal_items: [item(600, 20, 80, 20)] },
      { id: "3", logged_at: "", meal_type: "dinner", analysis_status: "needs_review", meal_items: [item(999)] },
    ],
    activities: [{ id: "a", activity_type: "running", started_at: "2026-10-04T06:00:00Z", duration_minutes: 30, calories_burned_kcal: 250, source: "manual" }],
    waterMl: [250, 500],
    baseTargetKcal: 2000,
  };
  it("excludes meals still under review", () => {
    const s = computeDailySummary({ ...base, budgetMethod: "base" });
    expect(s.consumed.calories).toBe(1000);
    expect(s.consumed.protein).toBe(32);
    expect(s.mealCount).toBe(2);
    expect(s.unconfirmedMealCount).toBe(1);
  });
  it("keeps food, activity and remaining figures separate", () => {
    const s = computeDailySummary({ ...base, budgetMethod: "base" });
    expect(s.activityKcal).toBe(250);
    expect(s.remainingBaseKcal).toBe(1000);
    expect(s.remainingAdjustedKcal).toBe(1250);
    expect(s.budgetKcal).toBe(2000);
    expect(s.netIntakeKcal).toBe(750);
    expect(s.waterMl).toBe(750);
  });
  it("adds exercise only when the user opted in", () => {
    const s = computeDailySummary({ ...base, budgetMethod: "exercise_adjusted" });
    expect(s.budgetKcal).toBe(2250);
  });
  it("recalculates after a delete", () => {
    const s = computeDailySummary({ ...base, meals: base.meals.slice(1), budgetMethod: "base" });
    expect(s.consumed.calories).toBe(600);
  });
});
