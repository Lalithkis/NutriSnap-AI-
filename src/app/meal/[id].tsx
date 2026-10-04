import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { normFood, useCreateSavedMeal, useDeleteMeal, useDeleteMealImage, useMeal, useSaveMeal } from "@/api/queries";
import type { FoodItem, MealLog } from "@/api/types";
import { MealThumb } from "@/components/MealCard";
import { Button, Card, ErrorState, Field, LoadingState, Notice, Row, Screen } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/upload";
import { itemFromPayload, useMealDraft } from "@/state/mealDraft";
import { colors, font, MEAL_LABELS, space } from "@/theme";

async function loadFoods(meal: MealLog): Promise<Map<string, FoodItem>> {
  const ids = meal.meal_items.map((i) => i.food_item_id).filter((x): x is string => !!x);
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("food_items").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data as FoodItem[]).map((f) => [f.id, normFood(f)]));
}

export default function MealDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meal = useMeal(id);
  const del = useDeleteMeal();
  const delImage = useDeleteMealImage();
  const save = useSaveMeal();
  const createSaved = useCreateSavedMeal();
  const { start } = useMealDraft();
  const [favName, setFavName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (meal.isLoading) return <Screen edges={[]}><LoadingState /></Screen>;
  if (!meal.data) return <Screen edges={[]}><ErrorState message={meal.error?.message ?? "Meal not found"} onRetry={() => meal.refetch()} /></Screen>;
  const m = meal.data;
  const payloadItems = m.meal_items.map(({ id: _i, meal_log_id: _m, sort_order: _s, ...rest }) => rest);

  const edit = async () => {
    try {
      const foods = await loadFoods(m);
      start({
        mode: "edit", mealId: m.id, mealType: m.meal_type, customMealName: m.custom_meal_name, loggedAt: m.logged_at, imagePath: m.image_storage_path,
        localImageUri: null, jobId: null, notes: m.notes ?? "", questions: [],
        items: m.meal_items.map((i) => itemFromPayload(i, i.food_item_id ? foods.get(i.food_item_id) ?? null : null)),
      });
      router.push("/meal/review");
    } catch (e) { Alert.alert("Couldn't open editor", (e as Error).message); }
  };

  const duplicate = async () => {
    try {
      await save.mutateAsync({ client_request_id: uuid(), logged_at: new Date().toISOString(), meal_type: m.meal_type, custom_meal_name: m.custom_meal_name, analysis_status: "manual", items: payloadItems.map((i) => ({ ...i, user_confirmed: true, ai_suggested_name: null })) });
      setMsg("Logged again for now.");
    } catch (e) { Alert.alert("Couldn't duplicate", (e as Error).message); }
  };

  const remove = () => Alert.alert("Delete this meal?", "This also deletes its photo and updates your daily totals.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => del.mutate(m, { onSuccess: () => router.back(), onError: (e) => Alert.alert("Couldn't delete", e.message) }) },
  ]);

  return (
    <Screen edges={[]}>
      <Row>
        <MealThumb path={m.image_storage_path} size={96} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={font.h2}>{m.meal_type === "other" && m.custom_meal_name ? m.custom_meal_name : MEAL_LABELS[m.meal_type]}</Text>
          <Text style={font.small}>{new Date(m.logged_at).toLocaleDateString()} · {formatTime(m.logged_at)}</Text>
          <Text style={[font.h2, { color: colors.primary }]}>{m.total_calories_kcal} kcal</Text>
        </View>
      </Row>
      {m.analysis_status === "saved_unconfirmed" && <Notice tone="warning">Saved as an unconfirmed AI estimate. Edit to review and confirm the items.</Notice>}
      {msg && <Notice>{msg}</Notice>}
      <Card style={{ gap: space.md }}>
        {m.meal_items.map((i) => (
          <View key={i.id} style={{ gap: 2 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={[font.h3, { flex: 1 }]}>{i.display_name}</Text>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>{i.calories_kcal} kcal</Text>
            </Row>
            <Text style={font.tiny}>{i.serving_quantity} × {i.serving_unit} · {i.serving_weight_g} g · P {i.protein_g}g C {i.carbs_g}g F {i.fat_g}g{i.fiber_g != null ? ` · Fiber ${i.fiber_g}g` : ""}</Text>
            <Text style={font.tiny}>{i.nutrition_source === "user_entered" ? "User-entered values" : i.nutrition_source === "usda_fdc" ? "USDA FoodData Central" : "Catalog estimate"}{i.is_approximate ? " · approximate" : ""}{i.estimate_confidence != null ? ` · AI confidence ${Math.round(i.estimate_confidence * 100)}%` : ""}</Text>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Text style={font.small}>Total · Protein {m.total_protein_g}g · Carbs {m.total_carbs_g}g · Fat {m.total_fat_g}g</Text>
        {m.notes && <Text style={font.small}>📝 {m.notes}</Text>}
      </Card>

      <Button title="Edit meal" icon="✏️" onPress={edit} />
      <Button title="Log again now" icon="🔁" variant="secondary" loading={save.isPending} onPress={duplicate} />
      {favName === null ? (
        <Button title="Save as favourite meal" icon="⭐" variant="secondary" onPress={() => setFavName(m.custom_meal_name ?? m.meal_items.map((i) => i.display_name).slice(0, 3).join(" + "))} />
      ) : (
        <Card style={{ gap: space.sm }}>
          <Field label="Name" value={favName} onChangeText={setFavName} maxLength={80} />
          <Button title="Save" loading={createSaved.isPending} onPress={() => createSaved.mutate({ name: favName.trim() || "My meal", meal_type: m.meal_type, items: payloadItems }, {
            onSuccess: () => { setFavName(null); setMsg("Saved to favourites."); }, onError: (e) => Alert.alert("Couldn't save", e.message),
          })} />
        </Card>
      )}
      {m.image_storage_path && <Button title="Delete photo only" variant="ghost" loading={delImage.isPending} onPress={() => delImage.mutate(m)} />}
      <Button title="Delete meal" variant="danger" loading={del.isPending} onPress={remove} />
    </Screen>
  );
}
