import type { MealType } from "@shared/analysis-schema.ts";
export type { MealType };

export interface Profile {
  id: string;
  display_name: string;
  date_of_birth: string | null;
  sex: "male" | "female" | "unspecified";
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  primary_goal: "maintain" | "lose_gradual" | "gain_muscle" | "awareness";
  dietary_preferences: string[];
  allergies: string[];
  pregnant_or_breastfeeding: boolean;
  calorie_target_kcal: number;
  calorie_target_is_manual: boolean;
  protein_target_g: number;
  carbohydrate_target_g: number;
  fat_target_g: number;
  water_target_ml: number;
  preferred_units: "metric" | "imperial";
  budget_method: "base" | "exercise_adjusted";
  time_zone: string;
  onboarding_completed: boolean;
  ai_consent_at: string | null;
}

export interface FoodItem {
  id: string;
  name: string;
  alternate_names: string[];
  category: string;
  serving_description: string;
  serving_weight_g: number;
  is_liquid: boolean;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  saturated_fat_per_100g: number | null;
  sodium_mg_per_100g: number | null;
  data_source: string;
  external_source_id: string | null;
  verification: "verified_source" | "curated_estimate" | "user_entered" | "ai_estimate";
  preparation_notes: string | null;
}

export interface MealItem {
  id: string;
  meal_log_id: string;
  food_item_id: string | null;
  custom_food_name: string | null;
  display_name: string;
  serving_quantity: number;
  serving_unit: string;
  serving_weight_g: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  estimate_confidence: number | null;
  nutrition_source: string;
  is_approximate: boolean;
  user_confirmed: boolean;
  ai_suggested_name: string | null;
  ai_estimated_weight_g: number | null;
  sort_order: number;
}

export interface MealLog {
  id: string;
  logged_at: string;
  meal_type: MealType;
  custom_meal_name: string | null;
  image_storage_path: string | null;
  notes: string | null;
  total_calories_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  analysis_status: "draft" | "analyzing" | "needs_review" | "confirmed" | "saved_unconfirmed" | "manual" | "failed";
  meal_items: MealItem[];
}

export interface ActivityLog {
  id: string;
  activity_type: string;
  custom_name: string | null;
  started_at: string;
  duration_minutes: number;
  distance_m: number | null;
  calories_burned_kcal: number | null;
  calories_is_estimate: boolean;
  intensity: "light" | "moderate" | "vigorous";
  steps: number | null;
  source: "manual" | "health_connect" | "healthkit";
}

export interface WaterLog { id: string; logged_at: string; volume_ml: number }
export interface WeightLog { id: string; measured_at: string; weight_kg: number }

export interface SavedMeal {
  id: string;
  name: string;
  meal_type: MealType | null;
  meal_definition_json: DraftItemPayload[];
  created_at: string;
}

/** Shape sent to the save_meal RPC (and stored in saved meals). */
export interface DraftItemPayload {
  food_item_id: string | null;
  custom_food_name: string | null;
  display_name: string;
  serving_quantity: number;
  serving_unit: string;
  serving_weight_g: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g?: number | null;
  sodium_mg?: number | null;
  estimate_confidence?: number | null;
  nutrition_source: string;
  is_approximate: boolean;
  user_confirmed: boolean;
  ai_suggested_name?: string | null;
  ai_estimated_weight_g?: number | null;
}

export interface AnalysisCandidate {
  ai_name: string;
  alternatives: string[];
  is_beverage: boolean;
  quantity: number;
  unit: string;
  estimated_weight_g: number;
  weight_range_g: [number, number] | null;
  visible_ingredients: string[];
  cooking_method: string | null;
  confidence: number;
  selected_food_id: string | null;
  matches: { score: number; food: FoodItem }[];
  nutrition: { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null; sugar_g: number | null } | null;
  needs_review: boolean;
  review_reasons: string[];
  applied_personal_correction: boolean;
}

export interface AnalysisResult {
  job_id: string;
  is_food: boolean;
  clarification_questions: string[];
  overall_notes: string | null;
  dropped_items: number;
  candidates: AnalysisCandidate[];
}
