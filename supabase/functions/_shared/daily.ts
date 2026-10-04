/**
 * Daily totals for a user's *local* calendar day. All energy figures are kept
 * separate; nothing here pretends to measure full energy balance.
 */
import { dedupeActivities, type ActivityRecord } from "./activity.ts";

export type BudgetMethod = "base" | "exercise_adjusted";

/** UTC [start, end) instants for a local date (YYYY-MM-DD) in an IANA time zone. */
export function localDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("date must be YYYY-MM-DD");
  const [y, m, d] = date.split("-").map(Number);
  const start = zonedMidnight(y, m, d, timeZone);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
  return { start, end };
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle DST transitions near midnight.
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** Local YYYY-MM-DD for an instant. */
export function toLocalDate(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export interface MealItemLike {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
}
export interface MealLike {
  id: string;
  logged_at: string;
  meal_type: string;
  analysis_status: string;
  meal_items: MealItemLike[];
}

export interface DailySummary {
  date: string;
  consumed: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number };
  activityKcal: number;
  activityMinutes: number;
  duplicateActivities: number;
  waterMl: number;
  baseTargetKcal: number;
  /** Target the user's budget method actually uses. */
  budgetKcal: number;
  budgetMethod: BudgetMethod;
  remainingBaseKcal: number;
  remainingAdjustedKcal: number;
  /** Food energy minus tracked activity energy. NOT energy balance (excludes resting metabolism). */
  netIntakeKcal: number;
  mealCount: number;
  unconfirmedMealCount: number;
}

/** Meals that count toward totals: confirmed, or explicitly saved as unconfirmed estimates. */
export const COUNTED_STATUSES = new Set(["confirmed", "saved_unconfirmed", "manual"]);

export function computeDailySummary(args: {
  date: string;
  meals: MealLike[];
  activities: (ActivityRecord & { calories_burned_kcal: number | null })[];
  waterMl: number[];
  baseTargetKcal: number;
  budgetMethod: BudgetMethod;
}): DailySummary {
  const counted = args.meals.filter((m) => COUNTED_STATUSES.has(m.analysis_status));
  const items = counted.flatMap((m) => m.meal_items);
  const sum = (f: (i: MealItemLike) => number | null) => items.reduce((a, i) => a + (f(i) ?? 0), 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const consumed = {
    calories: Math.round(sum((i) => i.calories_kcal)),
    protein: r1(sum((i) => i.protein_g)),
    carbs: r1(sum((i) => i.carbs_g)),
    fat: r1(sum((i) => i.fat_g)),
    fiber: r1(sum((i) => i.fiber_g)),
    sugar: r1(sum((i) => i.sugar_g)),
  };
  const { kept, duplicates } = dedupeActivities(args.activities);
  const activityKcal = Math.round(kept.reduce((a, r) => a + (r.calories_burned_kcal ?? 0), 0));
  const activityMinutes = Math.round(kept.reduce((a, r) => a + r.duration_minutes, 0));
  const waterMl = args.waterMl.reduce((a, b) => a + b, 0);
  const remainingBase = args.baseTargetKcal - consumed.calories;
  const remainingAdj = args.baseTargetKcal + activityKcal - consumed.calories;
  return {
    date: args.date,
    consumed,
    activityKcal,
    activityMinutes,
    duplicateActivities: duplicates.length,
    waterMl,
    baseTargetKcal: args.baseTargetKcal,
    budgetKcal: args.budgetMethod === "exercise_adjusted" ? args.baseTargetKcal + activityKcal : args.baseTargetKcal,
    budgetMethod: args.budgetMethod,
    remainingBaseKcal: remainingBase,
    remainingAdjustedKcal: remainingAdj,
    netIntakeKcal: consumed.calories - activityKcal,
    mealCount: counted.length,
    unconfirmedMealCount: counted.filter((m) => m.analysis_status === "saved_unconfirmed").length,
  };
}
