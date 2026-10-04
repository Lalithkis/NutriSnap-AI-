import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import type { FoodItem } from "@/api/types";
import { itemNutrition, itemWeight, type DraftItem } from "@/state/mealDraft";
import { colors, font, radius, space } from "@/theme";
import { Button, Card, Chip, Field, Notice, Row, Stepper } from "./ui";

export function confidenceLabel(c: number) {
  return c >= 0.8 ? { text: "High confidence", color: colors.success } : c >= 0.6 ? { text: "Medium confidence", color: colors.warning } : { text: "Low confidence", color: colors.danger };
}

export function DraftItemEditor({ item, onChange, onRemove, showConfirm = true }: {
  item: DraftItem; onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void; showConfirm?: boolean;
}) {
  const n = itemNutrition(item);
  const w = itemWeight(item);
  const [gramsText, setGramsText] = useState(String(w));
  const [customOpen, setCustomOpen] = useState(!item.food && !!item.custom);
  const conf = item.ai ? confidenceLabel(item.ai.confidence) : null;
  const choose = (food: FoodItem) => onChange({ food, custom: undefined });

  const setGrams = (t: string) => {
    setGramsText(t);
    const g = Number(t.replace(",", "."));
    if (Number.isFinite(g) && g > 0 && g <= 5000) onChange({ gramsPerUnit: Math.round((g / item.quantity) * 10) / 10 });
  };

  return (
    <Card style={{ gap: space.md, borderColor: item.confirmed ? colors.border : colors.warning }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={font.h3}>{item.food?.name ?? (item.customName || "Unnamed food")}</Text>
          {item.ai && item.food && item.ai.name.toLowerCase() !== item.food.name.toLowerCase() && <Text style={font.tiny}>AI saw: “{item.ai.name}”</Text>}
          {conf && <Text style={{ color: conf.color, fontSize: 12, fontWeight: "600" }}>● {conf.text} ({Math.round(item.ai!.confidence * 100)}%)</Text>}
        </View>
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${item.food?.name ?? item.customName}`} hitSlop={12}>
          <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "600" }}>Remove</Text>
        </Pressable>
      </Row>

      {item.ai && item.ai.matches.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={font.small}>Is it one of these?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {item.ai.matches.map((m) => <Chip key={m.id} label={m.name} selected={item.food?.id === m.id} onPress={() => choose(m)} />)}
          </View>
        </View>
      )}
      <Button title={item.food ? "Change food" : "Find this food"} icon="🔍" variant="secondary" style={{ minHeight: 44 }}
        onPress={() => router.push({ pathname: "/food-search", params: { replace: item.key, q: item.ai?.name ?? item.customName } })} />

      {item.ai?.reasons.map((r) => <Notice key={r} tone="warning">{r}</Notice>)}

      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={font.small}>Servings</Text>
          <Text style={font.tiny} numberOfLines={1}>{item.unit} ≈ {item.gramsPerUnit} g</Text>
        </View>
        <Stepper label="servings" value={item.quantity} onChange={(q) => { onChange({ quantity: q }); setGramsText(String(Math.round(q * item.gramsPerUnit * 10) / 10)); }} />
      </Row>
      <Field label={`Total weight (${item.ai?.isBeverage || item.food?.is_liquid ? "ml ≈ g" : "g"})`} value={gramsText} onChangeText={setGrams} keyboardType="decimal-pad"
        hint={item.ai?.weightRange ? `AI estimate ${item.ai.estimatedWeightG} g (likely ${item.ai.weightRange[0]}–${item.ai.weightRange[1]} g)` : undefined} />

      {!item.food && (
        customOpen ? (
          <View style={{ gap: space.sm }}>
            <Field label="Food name" value={item.customName} onChangeText={(t) => onChange({ customName: t })} maxLength={120} />
            <Text style={font.tiny}>Enter nutrition for the total weight above (e.g. from the package label). It will be marked as user-entered.</Text>
            <Row>
              {(["calories_kcal", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Field label={{ calories_kcal: "kcal", protein_g: "Prot g", carbs_g: "Carb g", fat_g: "Fat g" }[k]} keyboardType="decimal-pad"
                    value={item.custom ? String(item.custom[k]) : ""}
                    onChangeText={(t) => onChange({ custom: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...item.custom, [k]: Math.max(0, Number(t.replace(",", ".")) || 0) } })} />
                </View>
              ))}
            </Row>
          </View>
        ) : <Button title="Enter nutrition manually" variant="ghost" onPress={() => setCustomOpen(true)} />
      )}

      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space.md }}>
        {n ? (
          <Text style={font.small} accessibilityLabel={`${n.calories_kcal} kilocalories, protein ${n.protein_g} grams, carbs ${n.carbs_g} grams, fat ${n.fat_g} grams`}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>{n.calories_kcal} kcal</Text>
            {"  "}P {n.protein_g}g · C {n.carbs_g}g · F {n.fat_g}g{n.fiber_g != null ? ` · Fiber ${n.fiber_g}g` : ""}{n.sugar_g != null ? ` · Sugar ${n.sugar_g}g` : ""}
          </Text>
        ) : <Text style={{ color: colors.warning }}>No nutrition yet — pick a food or enter values.</Text>}
        {item.food && <Text style={font.tiny}>Source: {item.food.data_source === "usda_fdc" ? "USDA FoodData Central" : "NutriSnap catalog (typical recipe estimate)"}{item.food.preparation_notes ? ` · ${item.food.preparation_notes}` : ""}</Text>}
      </View>

      {showConfirm && (
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={font.body}>Looks right</Text>
          <Switch value={item.confirmed} onValueChange={(b) => onChange({ confirmed: b })} accessibilityLabel={`Confirm ${item.food?.name ?? item.customName}`}
            trackColor={{ true: colors.primaryDark, false: colors.border }} thumbColor={item.confirmed ? colors.primary : colors.textMuted} />
        </Row>
      )}
    </Card>
  );
}
