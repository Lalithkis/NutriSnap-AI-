import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { computeDailySummary, toLocalDate, type DailySummary } from "@shared/daily.ts";
import { localDayBounds } from "@/lib/dates";
import { invokeFunction, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { ActivityLog, DraftItemPayload, FoodItem, MealLog, MealType, Profile, SavedMeal, WaterLog, WeightLog } from "./types";

const MEAL_SELECT = "id,logged_at,meal_type,custom_meal_name,image_storage_path,notes,total_calories_kcal,total_protein_g,total_carbs_g,total_fat_g,analysis_status,meal_items(*)";

const num = (v: unknown) => (v == null ? v : Number(v)) as number;
/** Postgres numerics arrive as strings; normalise. */
function normMeal(m: MealLog): MealLog {
  return {
    ...m,
    total_protein_g: num(m.total_protein_g), total_carbs_g: num(m.total_carbs_g), total_fat_g: num(m.total_fat_g),
    meal_items: [...(m.meal_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({
      ...i,
      serving_quantity: num(i.serving_quantity), serving_weight_g: num(i.serving_weight_g),
      protein_g: num(i.protein_g), carbs_g: num(i.carbs_g), fat_g: num(i.fat_g),
      fiber_g: i.fiber_g == null ? null : num(i.fiber_g), sugar_g: i.sugar_g == null ? null : num(i.sugar_g),
      estimate_confidence: i.estimate_confidence == null ? null : num(i.estimate_confidence),
    })),
  };
}
const normFood = (f: FoodItem): FoodItem => ({
  ...f,
  serving_weight_g: num(f.serving_weight_g), calories_per_100g: num(f.calories_per_100g), protein_per_100g: num(f.protein_per_100g),
  carbs_per_100g: num(f.carbs_per_100g), fat_per_100g: num(f.fat_per_100g),
  fiber_per_100g: f.fiber_per_100g == null ? null : num(f.fiber_per_100g), sugar_per_100g: f.sugar_per_100g == null ? null : num(f.sugar_per_100g),
  sodium_mg_per_100g: f.sodium_mg_per_100g == null ? null : num(f.sodium_mg_per_100g),
  saturated_fat_per_100g: f.saturated_fat_per_100g == null ? null : num(f.saturated_fat_per_100g),
});
export { normFood };

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

// ---------------------------------------------------------------- profile
export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const p = check(await supabase.from("profiles").select("*").eq("id", session!.user.id).single()) as Profile;
      return { ...p, height_cm: p.height_cm == null ? null : num(p.height_cm), current_weight_kg: p.current_weight_kg == null ? null : num(p.current_weight_kg), target_weight_kg: p.target_weight_kg == null ? null : num(p.target_weight_kg) };
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => check(await supabase.from("profiles").update(patch).eq("id", session!.user.id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

// ---------------------------------------------------------------- range data
export interface RangeData { meals: MealLog[]; activities: ActivityLog[]; water: WaterLog[]; weights: WeightLog[] }

async function fetchRange(start: string, end: string, tz: string): Promise<RangeData> {
  const from = localDayBounds(start, tz).start.toISOString();
  const to = localDayBounds(end, tz).end.toISOString();
  const [meals, acts, water, weights] = await Promise.all([
    supabase.from("meal_logs").select(MEAL_SELECT).gte("logged_at", from).lt("logged_at", to).order("logged_at"),
    supabase.from("activity_logs").select("*").gte("started_at", from).lt("started_at", to).order("started_at"),
    supabase.from("water_logs").select("id,logged_at,volume_ml").gte("logged_at", from).lt("logged_at", to).order("logged_at"),
    supabase.from("weight_logs").select("id,measured_at,weight_kg").gte("measured_at", from).lt("measured_at", to).order("measured_at"),
  ]);
  return {
    meals: (check(meals) as MealLog[]).map(normMeal),
    activities: (check(acts) as ActivityLog[]).map((a) => ({ ...a, duration_minutes: num(a.duration_minutes), distance_m: a.distance_m == null ? null : num(a.distance_m) })),
    water: check(water) as WaterLog[],
    weights: (check(weights) as WeightLog[]).map((w) => ({ ...w, weight_kg: num(w.weight_kg) })),
  };
}

export function useRangeData(start: string, end: string, tz: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["range", session?.user.id, start, end, tz],
    enabled: !!session,
    queryFn: () => fetchRange(start, end, tz),
  });
}

export function summarizeDay(date: string, tz: string, data: RangeData, profile: Profile): DailySummary {
  const on = <T>(rows: T[], k: (r: T) => string) => rows.filter((r) => toLocalDate(k(r), tz) === date);
  return computeDailySummary({
    date,
    meals: on(data.meals, (m) => m.logged_at),
    activities: on(data.activities, (a) => a.started_at),
    waterMl: on(data.water, (w) => w.logged_at).map((w) => w.volume_ml),
    baseTargetKcal: profile.calorie_target_kcal,
    budgetMethod: profile.budget_method,
  });
}

/** Any write to personal data invalidates every cached range, so all totals refresh. */
function useInvalidateData() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["range"] }), qc.invalidateQueries({ queryKey: ["meal"] }), qc.invalidateQueries({ queryKey: ["recent-meals"] })]);
}

// ---------------------------------------------------------------- meals
export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: ["meal", id],
    enabled: !!id,
    queryFn: async () => normMeal(check(await supabase.from("meal_logs").select(MEAL_SELECT).eq("id", id!).single()) as MealLog),
  });
}

export interface SaveMealInput {
  id?: string;
  client_request_id?: string;
  logged_at: string;
  meal_type: MealType;
  custom_meal_name?: string | null;
  image_storage_path?: string | null;
  notes?: string | null;
  analysis_status: "confirmed" | "saved_unconfirmed" | "manual";
  analysis_job_id?: string | null;
  items: DraftItemPayload[];
}

export function useSaveMeal() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async ({ items, ...meal }: SaveMealInput) => {
      if (items.length === 0) throw new Error("Add at least one food");
      const { data, error } = await supabase.rpc("save_meal", { p_meal: meal, p_items: items });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMeal() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (meal: Pick<MealLog, "id" | "image_storage_path">) => {
      check(await supabase.from("meal_logs").delete().eq("id", meal.id).select("id"));
      if (meal.image_storage_path) await supabase.storage.from("meal-images").remove([meal.image_storage_path]);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMealImage() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (meal: Pick<MealLog, "id" | "image_storage_path">) => {
      if (!meal.image_storage_path) return;
      const { error } = await supabase.storage.from("meal-images").remove([meal.image_storage_path]);
      if (error) throw new Error(error.message);
      check(await supabase.from("meal_logs").update({ image_storage_path: null }).eq("id", meal.id).select("id"));
    },
    onSuccess: invalidate,
  });
}

export function useSignedImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("meal-images").createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

export function useMealSearch(q: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["recent-meals", session?.user.id, q],
    enabled: !!session,
    queryFn: async () => {
      let query = supabase.from("meal_items").select("id,display_name,calories_kcal,serving_quantity,serving_unit,meal_log_id,meal_logs!inner(id,logged_at,meal_type)").order("created_at", { ascending: false }).limit(50);
      if (q.trim().length >= 2) query = query.ilike("display_name", `%${q.trim()}%`);
      return check(await query) as unknown as { id: string; display_name: string; calories_kcal: number; serving_quantity: number; serving_unit: string; meal_log_id: string; meal_logs: { id: string; logged_at: string; meal_type: MealType } }[];
    },
  });
}

// ---------------------------------------------------------------- foods
export function useFoodSearch(q: string) {
  return useQuery({
    queryKey: ["food-search", q],
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Local catalog first (works without edge functions), then the remote-backed search.
      const local = (check(await supabase.rpc("search_foods", { q: q.trim(), max_results: 25 })) as FoodItem[]).map(normFood);
      if (local.length >= 5) return { results: local, remote_status: "skipped" as const };
      try {
        const r = await invokeFunction<{ results: FoodItem[]; remote_status: string }>("food-search", { q: q.trim() });
        return { results: r.results.map(normFood), remote_status: r.remote_status };
      } catch {
        return { results: local, remote_status: "unavailable" as const };
      }
    },
  });
}

export function useFavorites() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["favorites", session?.user.id],
    enabled: !!session,
    queryFn: async () => (check(await supabase.from("food_favorites").select("food_item_id, food_items(*)").order("created_at", { ascending: false })) as unknown as { food_item_id: string; food_items: FoodItem }[])
      .map((r) => normFood(r.food_items)),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ foodId, favorite }: { foodId: string; favorite: boolean }) => {
      if (favorite) check(await supabase.from("food_favorites").upsert({ food_item_id: foodId }).select());
      else check(await supabase.from("food_favorites").delete().eq("food_item_id", foodId).select());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
}

export function useSavedMeals() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["saved-meals", session?.user.id],
    enabled: !!session,
    queryFn: async () => check(await supabase.from("saved_meals").select("*").order("created_at", { ascending: false })) as SavedMeal[],
  });
}

export function useCreateSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { name: string; meal_type: MealType | null; items: DraftItemPayload[] }) =>
      check(await supabase.from("saved_meals").insert({ name: m.name, meal_type: m.meal_type, meal_definition_json: m.items }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-meals"] }),
  });
}

export function useDeleteSavedMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { check(await supabase.from("saved_meals").delete().eq("id", id).select("id")); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-meals"] }),
  });
}

// ---------------------------------------------------------------- water / weight / activity
export function useAddWater() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (v: { volume_ml: number; logged_at?: string }) => check(await supabase.from("water_logs").insert(v).select().single()),
    onSuccess: invalidate,
  });
}
export function useDeleteWater() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (id: string) => { check(await supabase.from("water_logs").delete().eq("id", id).select("id")); },
    onSuccess: invalidate,
  });
}
export function useAddWeight() {
  const invalidate = useInvalidateData();
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (v: { weight_kg: number; measured_at?: string }) => {
      const row = check(await supabase.from("weight_logs").insert(v).select().single());
      // Keep the profile's current weight in sync with the latest entry.
      await supabase.from("profiles").update({ current_weight_kg: v.weight_kg }).eq("id", session!.user.id);
      return row;
    },
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["weights"] }); },
  });
}
export function useDeleteWeight() {
  const invalidate = useInvalidateData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { check(await supabase.from("weight_logs").delete().eq("id", id).select("id")); },
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["weights"] }); },
  });
}
export function useAllWeights() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["weights", session?.user.id],
    enabled: !!session,
    queryFn: async () => (check(await supabase.from("weight_logs").select("id,measured_at,weight_kg").order("measured_at", { ascending: false }).limit(365)) as WeightLog[])
      .map((w) => ({ ...w, weight_kg: num(w.weight_kg) })),
  });
}

export interface ActivityInput {
  activity_type: string;
  custom_name?: string | null;
  started_at: string;
  duration_minutes: number;
  distance_m?: number | null;
  calories_burned_kcal: number | null;
  intensity: "light" | "moderate" | "vigorous";
}
export function useSaveActivity() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (a: ActivityInput & { id?: string }) => {
      const { id, ...row } = a;
      if (id) return check(await supabase.from("activity_logs").update(row).eq("id", id).select().single());
      return check(await supabase.from("activity_logs").insert({ ...row, source: "manual", calories_is_estimate: true }).select().single());
    },
    onSuccess: invalidate,
  });
}
export function useDeleteActivity() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (id: string) => { check(await supabase.from("activity_logs").delete().eq("id", id).select("id")); },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- assistant
export function useAssistantHistory() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["assistant", session?.user.id],
    enabled: !!session,
    queryFn: async () => check(await supabase.from("assistant_messages").select("id,role,content,created_at").order("created_at").limit(100)) as { id: string; role: "user" | "assistant"; content: string; created_at: string }[],
  });
}
export function useAskAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { message: string; time_zone: string }) => invokeFunction<{ answer: string }>("assistant", v),
    onSettled: () => qc.invalidateQueries({ queryKey: ["assistant"] }),
  });
}
export function useClearAssistant() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async () => { check(await supabase.from("assistant_messages").delete().eq("user_id", session!.user.id).select("id")); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant"] }),
  });
}
