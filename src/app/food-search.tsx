import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFavorites, useFoodSearch, useToggleFavorite } from "@/api/queries";
import type { FoodItem } from "@/api/types";
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen } from "@/components/ui";
import { suggestMealType } from "@/lib/dates";
import { uuid } from "@/lib/upload";
import { itemFromFood, useMealDraft } from "@/state/mealDraft";
import { colors, font, space } from "@/theme";

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export default function FoodSearch() {
  const params = useLocalSearchParams<{ replace?: string; q?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const dq = useDebounced(q);
  const search = useFoodSearch(dq);
  const favs = useFavorites();
  const toggleFav = useToggleFavorite();
  const { draft, start, addItems, updateItem } = useMealDraft();
  const favIds = new Set((favs.data ?? []).map((f) => f.id));

  const ensureDraft = () => {
    if (!draft) start({ mode: "manual", mealType: suggestMealType(), loggedAt: new Date().toISOString(), imagePath: null, localImageUri: null, jobId: null, notes: "", questions: [], items: [] });
  };

  const choose = (food: FoodItem) => {
    if (params.replace && draft) {
      const old = draft.items.find((i) => i.key === params.replace);
      // Keep the weight the user/AI estimated; switch the nutrition source.
      updateItem(params.replace, { food, custom: undefined, customName: food.name, confirmed: true, gramsPerUnit: old?.gramsPerUnit ?? food.serving_weight_g });
      router.back();
      return;
    }
    ensureDraft();
    addItems([itemFromFood(food)]);
    router.replace("/meal/review");
  };

  const addCustom = () => {
    ensureDraft();
    addItems([{ key: uuid(), food: null, customName: q.trim() || "Custom food", quantity: 1, unit: "serving", gramsPerUnit: 100, custom: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, confirmed: true }]);
    router.replace("/meal/review");
  };

  const list = dq.trim().length >= 2 ? search.data?.results ?? [] : favs.data ?? [];

  return (
    <Screen edges={[]}>
      <Field label="Search foods" value={q} onChangeText={setQ} placeholder="e.g. idli, chicken curry, banana" autoFocus autoCorrect={false} returnKeyType="search" />
      {dq.trim().length < 2 && <Text style={font.small}>{favs.data?.length ? "⭐ Your favourite foods" : "Type at least 2 letters to search Indian and international foods."}</Text>}
      {search.isFetching && <LoadingState label="Searching…" />}
      {search.error && <ErrorState message={search.error.message} onRetry={() => search.refetch()} />}
      {search.data?.remote_status === "not_configured" && search.data.results.length < 5 && (
        <Notice>Showing the built-in catalog only. The USDA database isn't configured on this server.</Notice>
      )}
      {search.data?.remote_status === "unavailable" && <Notice tone="warning">The online food database is unavailable right now; showing local results.</Notice>}
      {list.map((f) => (
        <Pressable key={f.id} onPress={() => choose(f)} accessibilityRole="button" accessibilityLabel={`${f.name}, ${Math.round((f.calories_per_100g * f.serving_weight_g) / 100)} kilocalories per ${f.serving_description}`}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={font.h3}>{f.name}</Text>
              <Text style={font.tiny}>{f.serving_description} ({f.serving_weight_g} g) · {Math.round((f.calories_per_100g * f.serving_weight_g) / 100)} kcal</Text>
              <Text style={font.tiny}>{f.calories_per_100g} kcal/100g · P {f.protein_per_100g} · C {f.carbs_per_100g} · F {f.fat_per_100g} · {f.verification === "verified_source" ? "USDA" : "estimate"}</Text>
            </View>
            <Pressable hitSlop={12} onPress={() => toggleFav.mutate({ foodId: f.id, favorite: !favIds.has(f.id) })} accessibilityRole="button" accessibilityLabel={favIds.has(f.id) ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`}>
              <Text style={{ fontSize: 22, color: colors.warning }}>{favIds.has(f.id) ? "★" : "☆"}</Text>
            </Pressable>
          </Card>
        </Pressable>
      ))}
      {dq.trim().length >= 2 && !search.isFetching && list.length === 0 && (
        <EmptyState icon="🤷" title="No matches" body="Try another name, or add it as a custom food with values from its label." />
      )}
      <Row><Button title="Add custom food" icon="✍️" variant="secondary" style={{ flex: 1 }} onPress={addCustom} /></Row>
    </Screen>
  );
}
