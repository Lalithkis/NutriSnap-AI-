import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { sumNutrients } from "@shared/nutrition.ts";
import { useSaveMeal } from "@/api/queries";
import { DraftItemEditor } from "@/components/DraftItemEditor";
import { Button, Card, ChipRow, EmptyState, Field, Notice, Row, Screen } from "@/components/ui";
import { draftItemToPayload, itemNutrition, useMealDraft } from "@/state/mealDraft";
import { colors, font, MEAL_LABELS, MEAL_ORDER, radius, space } from "@/theme";

export default function Review() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { draft, update, updateItem, removeItem, clear } = useMealDraft();
  const save = useSaveMeal();
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => sumNutrients((draft?.items ?? []).map((i) => itemNutrition(i) ?? {})), [draft?.items]);
  if (!draft) return <Screen edges={[]}><EmptyState icon="🍽️" title="No meal in progress" action={{ label: "Scan a meal", onPress: () => router.replace("/scan") }} /></Screen>;

  const missing = draft.items.filter((i) => !itemNutrition(i));
  const unconfirmed = draft.items.filter((i) => !i.confirmed);
  const isAi = draft.mode === "photo";

  const doSave = async (status: "confirmed" | "saved_unconfirmed" | "manual", confirmAll: boolean) => {
    setError(null);
    if (draft.items.length === 0) return setError("Add at least one food.");
    if (missing.length) return setError(`Choose a food or enter nutrition for: ${missing.map((m) => m.customName || "unnamed item").join(", ")}`);
    if (draft.mealType === "other" && !draft.customMealName?.trim()) return setError("Name this meal (e.g. ‘Pre-workout’).");
    try {
      const items = draft.items.map((i) => draftItemToPayload(confirmAll ? { ...i, confirmed: true } : i));
      const id = await save.mutateAsync({
        id: draft.mealId, client_request_id: draft.mealId ? undefined : draft.clientRequestId,
        logged_at: draft.loggedAt, meal_type: draft.mealType, custom_meal_name: draft.mealType === "other" ? draft.customMealName : null,
        image_storage_path: draft.imagePath, notes: draft.notes || null, analysis_status: status, analysis_job_id: draft.jobId, items,
      });
      const kcal = totals.calories_kcal;
      clear();
      router.replace({ pathname: "/meal/success", params: { id, kcal: String(kcal), edited: draft.mealId ? "1" : "" } });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const discard = () => Alert.alert("Discard this meal?", "Nothing has been saved yet.", [
    { text: "Keep editing", style: "cancel" },
    { text: "Discard", style: "destructive", onPress: () => { clear(); router.back(); } },
  ]);

  return (
    <Screen edges={[]}>
      {draft.localImageUri && <Image source={{ uri: draft.localImageUri }} style={{ width: "100%", height: 200, borderRadius: radius.lg }} contentFit="cover" accessibilityLabel="Your meal photo" />}
      {notice === "not_food" && <Notice tone="warning">This photo doesn't seem to show food. Retake the photo or add foods manually below.</Notice>}
      {notice === "no_items" && <Notice tone="warning">No foods could be identified. Retake the photo or add foods manually below.</Notice>}
      {isAi && draft.items.length > 0 && (
        <Notice>AI estimates are approximate — photos can't show exact weight, hidden ingredients or cooking oil. Check each item and adjust portions.</Notice>
      )}
      {draft.questions.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Text style={font.h3}>Worth checking</Text>
          {draft.questions.map((q) => <Text key={q} style={font.small}>• {q}</Text>)}
        </Card>
      )}

      <Text style={font.small}>Meal</Text>
      <ChipRow options={MEAL_ORDER} value={draft.mealType} onChange={(m) => update({ mealType: m })} labels={MEAL_LABELS} />
      {draft.mealType === "other" && <Field label="Meal name" value={draft.customMealName ?? ""} onChangeText={(t) => update({ customMealName: t })} maxLength={40} />}

      {draft.items.map((i) => (
        <DraftItemEditor key={i.key} item={i} onChange={(p) => updateItem(i.key, p)} onRemove={() => removeItem(i.key)} showConfirm={isAi} />
      ))}
      <Button title="Add another food" icon="＋" variant="secondary" onPress={() => router.push("/food-search")} />
      <Field label="Notes (optional)" value={draft.notes} onChangeText={(t) => update({ notes: t })} maxLength={1000} multiline />

      <Card style={{ gap: 6 }}>
        <Text style={font.h3}>Meal total</Text>
        <Text style={[font.h1, { color: colors.primary }]}>{totals.calories_kcal} kcal</Text>
        <Text style={font.small}>Protein {totals.protein_g}g · Carbs {totals.carbs_g}g · Fat {totals.fat_g}g</Text>
        {totals.fiber_g != null && <Text style={font.tiny}>Fiber {totals.fiber_g}g{totals.partial.fiber_g ? " (some items unknown)" : ""}{totals.sugar_g != null ? ` · Sugar ${totals.sugar_g}g${totals.partial.sugar_g ? " (some unknown)" : ""}` : ""}</Text>}
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}
      <View style={{ gap: space.sm }}>
        {isAi ? (
          <>
            <Button title={unconfirmed.length ? "Confirm all & save" : "Save meal"} loading={save.isPending} onPress={() => doSave("confirmed", true)} />
            {unconfirmed.length > 0 && (
              <Button title="Save as unconfirmed estimate" variant="secondary" loading={save.isPending} onPress={() => doSave("saved_unconfirmed", false)}
                accessibilityHint="Saves without confirming; the meal will be labelled as an unconfirmed estimate" />
            )}
            <Row><Button title="Retake photo" variant="ghost" style={{ flex: 1 }} onPress={() => { clear(); router.replace("/scan"); }} /><Button title="Discard" variant="ghost" style={{ flex: 1 }} onPress={discard} /></Row>
          </>
        ) : (
          <>
            <Button title={draft.mealId ? "Save changes" : "Save meal"} loading={save.isPending} onPress={() => doSave(draft.mealId && draft.mode === "edit" ? "confirmed" : "manual", true)} />
            <Button title="Discard" variant="ghost" onPress={discard} />
          </>
        )}
      </View>
    </Screen>
  );
}
