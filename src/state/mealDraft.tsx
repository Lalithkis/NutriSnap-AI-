/**
 * In-memory draft of the meal being reviewed (from a photo, search, saved meal or edit).
 * Nutrition is always derived from per-100 g values × weight; the user can only
 * override numbers for custom foods, which are then marked approximate.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { calculateNutrition } from "@shared/nutrition.ts";
import type { AnalysisCandidate, DraftItemPayload, FoodItem, MealItem, MealType } from "@/api/types";
import { uuid } from "@/lib/upload";

export interface DraftItem {
  key: string;
  food: FoodItem | null;            // null → custom food with user-entered nutrition
  customName: string;
  quantity: number;                  // number of `unit`
  unit: string;
  gramsPerUnit: number;              // weight of one unit
  custom?: { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  confirmed: boolean;
  ai?: { name: string; confidence: number; estimatedWeightG: number; weightRange: [number, number] | null; reasons: string[]; alternatives: string[]; matches: FoodItem[]; isBeverage: boolean };
}

export interface MealDraft {
  mode: "photo" | "manual" | "edit";
  mealId?: string;
  clientRequestId: string;
  mealType: MealType;
  customMealName?: string | null;
  loggedAt: string;
  imagePath: string | null;
  localImageUri: string | null;
  jobId: string | null;
  notes: string;
  questions: string[];
  items: DraftItem[];
}

export function itemWeight(i: DraftItem) {
  return Math.round(i.quantity * i.gramsPerUnit * 10) / 10;
}

export function itemNutrition(i: DraftItem) {
  const w = itemWeight(i);
  if (i.food && w > 0) return calculateNutrition(i.food, w);
  if (i.custom) return { ...i.custom, fiber_g: null, sugar_g: null, sodium_mg: null, saturated_fat_g: null };
  return null;
}

export function draftItemToPayload(i: DraftItem): DraftItemPayload {
  const n = itemNutrition(i);
  if (!n) throw new Error(`"${i.customName || i.ai?.name || "Item"}" needs a food match or nutrition values`);
  return {
    food_item_id: i.food?.id ?? null,
    custom_food_name: i.food ? null : i.customName.trim(),
    display_name: (i.food ? i.food.name : i.customName).trim().slice(0, 120),
    serving_quantity: i.quantity,
    serving_unit: i.unit,
    serving_weight_g: itemWeight(i),
    calories_kcal: n.calories_kcal,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    fiber_g: n.fiber_g,
    sugar_g: n.sugar_g,
    saturated_fat_g: n.saturated_fat_g,
    sodium_mg: n.sodium_mg,
    estimate_confidence: i.ai?.confidence ?? null,
    nutrition_source: i.food ? i.food.data_source : "user_entered",
    is_approximate: !i.food || i.food.verification !== "verified_source" || !!i.ai,
    user_confirmed: i.confirmed,
    ai_suggested_name: i.ai?.name ?? null,
    ai_estimated_weight_g: i.ai?.estimatedWeightG ?? null,
  };
}

export function itemFromFood(food: FoodItem, quantity = 1): DraftItem {
  return { key: uuid(), food, customName: food.name, quantity, unit: food.serving_description, gramsPerUnit: food.serving_weight_g, confirmed: true };
}

export function itemFromCandidate(c: AnalysisCandidate): DraftItem {
  const food = c.matches.find((m) => m.food.id === c.selected_food_id)?.food ?? null;
  const qty = c.quantity > 0 ? c.quantity : 1;
  return {
    key: uuid(),
    food,
    customName: c.ai_name,
    quantity: qty,
    unit: c.unit,
    gramsPerUnit: Math.round((c.estimated_weight_g / qty) * 10) / 10,
    confirmed: false,
    ai: {
      name: c.ai_name, confidence: c.confidence, estimatedWeightG: c.estimated_weight_g, weightRange: c.weight_range_g,
      reasons: c.review_reasons, alternatives: c.alternatives, matches: c.matches.map((m) => m.food), isBeverage: c.is_beverage,
    },
  };
}

export function itemFromPayload(p: DraftItemPayload | MealItem, food: FoodItem | null): DraftItem {
  const qty = Number(p.serving_quantity) || 1;
  return {
    key: uuid(),
    food,
    customName: p.custom_food_name ?? p.display_name,
    quantity: qty,
    unit: p.serving_unit,
    gramsPerUnit: Math.round((Number(p.serving_weight_g) / qty) * 10) / 10,
    custom: food ? undefined : { calories_kcal: p.calories_kcal, protein_g: Number(p.protein_g), carbs_g: Number(p.carbs_g), fat_g: Number(p.fat_g) },
    confirmed: true,
  };
}

interface Ctx {
  draft: MealDraft | null;
  start: (d: Omit<MealDraft, "clientRequestId"> & { clientRequestId?: string }) => void;
  update: (patch: Partial<MealDraft>) => void;
  updateItem: (key: string, patch: Partial<DraftItem>) => void;
  addItems: (items: DraftItem[]) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}
const DraftContext = createContext<Ctx | null>(null);

export function MealDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const start = useCallback<Ctx["start"]>((d) => setDraft({ ...d, clientRequestId: d.clientRequestId ?? uuid() }), []);
  const update = useCallback((patch: Partial<MealDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const updateItem = useCallback((key: string, patch: Partial<DraftItem>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) } : d)), []);
  const addItems = useCallback((items: DraftItem[]) => setDraft((d) => (d ? { ...d, items: [...d.items, ...items] } : d)), []);
  const removeItem = useCallback((key: string) => setDraft((d) => (d ? { ...d, items: d.items.filter((i) => i.key !== key) } : d)), []);
  const clear = useCallback(() => setDraft(null), []);
  const value = useMemo(() => ({ draft, start, update, updateItem, addItems, removeItem, clear }), [draft, start, update, updateItem, addItems, removeItem, clear]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useMealDraft() {
  const c = useContext(DraftContext);
  if (!c) throw new Error("useMealDraft outside provider");
  return c;
}
