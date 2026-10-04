import { router } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { useDeleteSavedMeal, useFavorites, useSaveMeal, useSavedMeals, useToggleFavorite } from "@/api/queries";
import type { FoodItem, SavedMeal } from "@/api/types";
import { Button, Card, EmptyState, ErrorState, LoadingState, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { suggestMealType } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/upload";
import { itemFromFood, itemFromPayload, useMealDraft } from "@/state/mealDraft";
import { colors, font, MEAL_LABELS, space } from "@/theme";
import { normFood } from "@/api/queries";
import { useState } from "react";

export default function Favorites() {
  const saved = useSavedMeals();
  const favs = useFavorites();
  const del = useDeleteSavedMeal();
  const toggle = useToggleFavorite();
  const save = useSaveMeal();
  const { start } = useMealDraft();
  const [msg, setMsg] = useState<string | null>(null);

  const logNow = async (m: SavedMeal) => {
    try {
      await save.mutateAsync({ client_request_id: uuid(), logged_at: new Date().toISOString(), meal_type: m.meal_type ?? suggestMealType(), analysis_status: "manual", items: m.meal_definition_json.map((i) => ({ ...i, user_confirmed: true, ai_suggested_name: null })) });
      setMsg(`“${m.name}” logged.`);
    } catch (e) { Alert.alert("Couldn't log", (e as Error).message); }
  };

  const editThenLog = async (m: SavedMeal) => {
    const ids = m.meal_definition_json.map((i) => i.food_item_id).filter((x): x is string => !!x);
    const { data } = ids.length ? await supabase.from("food_items").select("*").in("id", ids) : { data: [] };
    const foods = new Map(((data ?? []) as FoodItem[]).map((f) => [f.id, normFood(f)]));
    start({ mode: "manual", mealType: m.meal_type ?? suggestMealType(), loggedAt: new Date().toISOString(), imagePath: null, localImageUri: null, jobId: null, notes: "", questions: [],
      items: m.meal_definition_json.map((i) => itemFromPayload(i, i.food_item_id ? foods.get(i.food_item_id) ?? null : null)) });
    router.push("/meal/review");
  };

  const quickAdd = (f: FoodItem) => {
    start({ mode: "manual", mealType: suggestMealType(), loggedAt: new Date().toISOString(), imagePath: null, localImageUri: null, jobId: null, notes: "", questions: [], items: [itemFromFood(f)] });
    router.push("/meal/review");
  };

  return (
    <Screen edges={[]}>
      {msg && <Notice>{msg}</Notice>}
      <SectionTitle title="Saved meals" />
      {saved.isLoading ? <LoadingState /> : saved.error ? <ErrorState message={saved.error.message} /> : saved.data?.length === 0 ? (
        <EmptyState icon="🍱" title="No saved meals" body="Open any logged meal and tap ‘Save as favourite meal’." />
      ) : saved.data?.map((m) => {
        const kcal = m.meal_definition_json.reduce((a, i) => a + i.calories_kcal, 0);
        return (
          <Card key={m.id} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{m.name}</Text>
                <Text style={font.tiny}>{m.meal_type ? MEAL_LABELS[m.meal_type] + " · " : ""}{m.meal_definition_json.map((i) => i.display_name).join(", ")}</Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>{kcal} kcal</Text>
            </Row>
            <Row>
              <Button title="Log now" style={{ flex: 1, minHeight: 44 }} loading={save.isPending} onPress={() => logNow(m)} />
              <Button title="Adjust" variant="secondary" style={{ flex: 1, minHeight: 44 }} onPress={() => editThenLog(m)} />
              <Pressable onPress={() => Alert.alert("Delete saved meal?", m.name, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => del.mutate(m.id) }])} accessibilityRole="button" accessibilityLabel={`Delete ${m.name}`} hitSlop={10}>
                <Text style={{ color: colors.danger }}>Delete</Text>
              </Pressable>
            </Row>
          </Card>
        );
      })}
      <SectionTitle title="Favourite foods" />
      {favs.isLoading ? <LoadingState /> : favs.data?.length === 0 ? (
        <EmptyState icon="⭐" title="No favourite foods" body="Tap the star next to any food when searching." />
      ) : favs.data?.map((f) => (
        <Card key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}>
          <Pressable style={{ flex: 1 }} onPress={() => quickAdd(f)} accessibilityRole="button" accessibilityLabel={`Log ${f.name}`}>
            <Text style={font.h3}>{f.name}</Text>
            <Text style={font.tiny}>{f.serving_description} · {Math.round((f.calories_per_100g * f.serving_weight_g) / 100)} kcal</Text>
          </Pressable>
          <Pressable onPress={() => toggle.mutate({ foodId: f.id, favorite: false })} accessibilityRole="button" accessibilityLabel={`Remove ${f.name} from favourites`} hitSlop={10}>
            <Text style={{ fontSize: 22, color: colors.warning }}>★</Text>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}
