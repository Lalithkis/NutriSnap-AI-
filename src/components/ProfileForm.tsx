import { useMemo, useState } from "react";
import { Switch, Text, View } from "react-native";
import { ageFromDob, cmToFtIn, defaultWaterTargetMl, estimateEnergy, ftInToCm, kgToLb, lbToKg, type ActivityLevel, type Goal } from "@shared/energy.ts";
import type { Profile } from "@/api/types";
import { deviceTimeZone } from "@/lib/dates";
import { colors, font, space } from "@/theme";
import { Button, Card, Chip, ChipRow, Field, Notice, Row } from "./ui";

const ACTIVITY: Record<ActivityLevel, string> = { sedentary: "Mostly sitting", light: "Lightly active", moderate: "Moderately active", active: "Very active", very_active: "Athlete / physical job" };
const GOALS: Record<Goal, string> = { maintain: "Maintain weight", lose_gradual: "Gradual weight loss", gain_muscle: "Build muscle", awareness: "Nutrition awareness" };
const DIETS = ["vegetarian", "vegan", "eggetarian", "pescatarian", "jain", "halal", "non-vegetarian", "low-carb"];
const ALLERGENS = ["peanuts", "tree nuts", "milk", "egg", "wheat/gluten", "soy", "fish", "shellfish", "sesame"];

export type Section = "basics" | "body" | "lifestyle" | "targets";

export interface ProfileFormValue extends Partial<Profile> {}

function toggle(arr: string[], v: string) { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; }

export function ProfileForm({ initial, sections, submitLabel, onSubmit, busy }: {
  initial: Profile; sections: Section[]; submitLabel: string; busy?: boolean; onSubmit: (patch: Partial<Profile>) => void;
}) {
  const [v, setV] = useState<Profile>(initial);
  const set = (p: Partial<Profile>) => setV((x) => ({ ...x, ...p }));
  const imperial = v.preferred_units === "imperial";
  const [heightText, setHeightText] = useState(() => (v.height_cm ? (imperial ? `${cmToFtIn(v.height_cm).ft}'${cmToFtIn(v.height_cm).in}` : String(v.height_cm)) : ""));
  const [weightText, setWeightText] = useState(() => (v.current_weight_kg ? String(imperial ? kgToLb(v.current_weight_kg) : v.current_weight_kg) : ""));
  const [targetText, setTargetText] = useState(() => (v.target_weight_kg ? String(imperial ? kgToLb(v.target_weight_kg) : v.target_weight_kg) : ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customAllergy, setCustomAllergy] = useState("");

  const parseHeight = (t: string): number | null => {
    if (!t.trim()) return null;
    if (imperial) {
      const m = t.match(/^\s*(\d)\s*['’ ]\s*(\d{1,2})?/);
      return m ? ftInToCm(Number(m[1]), Number(m[2] ?? 0)) : null;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const parseWeight = (t: string): number | null => {
    if (!t.trim()) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return imperial ? lbToKg(n) : n;
  };

  const age = v.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(v.date_of_birth) ? ageFromDob(v.date_of_birth) : null;
  const heightCm = parseHeight(heightText);
  const weightKg = parseWeight(weightText);

  const estimate = useMemo(() => {
    if (age == null || !heightCm || !weightKg) return null;
    try {
      return estimateEnergy({ ageYears: age, sex: v.sex, heightCm, weightKg, activityLevel: v.activity_level, goal: v.primary_goal, pregnantOrBreastfeeding: v.pregnant_or_breastfeeding });
    } catch { return null; }
  }, [age, heightCm, weightKg, v.sex, v.activity_level, v.primary_goal, v.pregnant_or_breastfeeding]);

  const applyEstimate = () => {
    if (!estimate) return;
    set({ calorie_target_kcal: estimate.targetKcal, protein_target_g: estimate.proteinG, carbohydrate_target_g: estimate.carbsG, fat_target_g: estimate.fatG, calorie_target_is_manual: false });
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (sections.includes("basics")) {
      if (!v.display_name?.trim()) e.name = "Required";
      if (v.date_of_birth && (age == null || age < 13 || age > 110)) e.dob = age != null && age < 13 ? "NutriSnap is for ages 13 and up" : "Use YYYY-MM-DD";
      if (!v.date_of_birth) e.dob = "Required for energy estimates";
    }
    if (sections.includes("body")) {
      if (!heightCm || heightCm < 100 || heightCm > 250) e.height = imperial ? "Use feet'inches, e.g. 5'9" : "Enter 100–250 cm";
      if (!weightKg || weightKg < 25 || weightKg > 350) e.weight = "Enter a valid weight";
      const t = parseWeight(targetText);
      if (targetText.trim() && (!t || t < 25 || t > 350)) e.target = "Enter a valid weight or leave blank";
    }
    if (sections.includes("targets")) {
      if (v.calorie_target_kcal < 800 || v.calorie_target_kcal > 6000) e.kcal = "800–6000 kcal";
      if (v.water_target_ml < 500 || v.water_target_ml > 8000) e.water = "500–8000 ml";
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const patch: Partial<Profile> = { ...v, time_zone: deviceTimeZone() };
    if (sections.includes("body")) {
      patch.height_cm = heightCm; patch.current_weight_kg = weightKg; patch.target_weight_kg = parseWeight(targetText);
      if (!initial.water_target_ml || initial.water_target_ml === 2500) patch.water_target_ml = defaultWaterTargetMl(weightKg!);
    }
    if (sections.includes("lifestyle") && estimate && !v.calorie_target_is_manual) {
      Object.assign(patch, { calorie_target_kcal: estimate.targetKcal, protein_target_g: estimate.proteinG, carbohydrate_target_g: estimate.carbsG, fat_target_g: estimate.fatG });
    }
    delete (patch as Record<string, unknown>).id;
    onSubmit(patch);
  };

  return (
    <View style={{ gap: space.lg }}>
      {sections.includes("basics") && (
        <Card style={{ gap: space.md }}>
          <Text style={font.h3}>About you</Text>
          <Field label="Display name" value={v.display_name} onChangeText={(t) => set({ display_name: t })} error={errors.name} maxLength={60} />
          <Field label="Date of birth (YYYY-MM-DD)" value={v.date_of_birth ?? ""} onChangeText={(t) => set({ date_of_birth: t || null })} placeholder="1995-04-21" error={errors.dob} keyboardType="numbers-and-punctuation" />
          <Text style={font.small}>Sex used in the energy equation</Text>
          <ChipRow options={["female", "male", "unspecified"] as const} value={v.sex} onChange={(s) => set({ sex: s })} labels={{ female: "Female", male: "Male", unspecified: "Prefer not to say" }} />
          <Text style={font.small}>Units</Text>
          <ChipRow options={["metric", "imperial"] as const} value={v.preferred_units} onChange={(u) => { set({ preferred_units: u }); setHeightText(""); setWeightText(""); setTargetText(""); }} labels={{ metric: "Metric (kg, cm)", imperial: "Imperial (lb, ft)" }} />
        </Card>
      )}
      {sections.includes("body") && (
        <Card style={{ gap: space.md }}>
          <Text style={font.h3}>Body</Text>
          <Field label={imperial ? "Height (ft'in)" : "Height (cm)"} value={heightText} onChangeText={setHeightText} keyboardType={imperial ? "numbers-and-punctuation" : "decimal-pad"} placeholder={imperial ? "5'9" : "170"} error={errors.height} />
          <Field label={`Current weight (${imperial ? "lb" : "kg"})`} value={weightText} onChangeText={setWeightText} keyboardType="decimal-pad" error={errors.weight} />
          <Field label={`Target weight (${imperial ? "lb" : "kg"}, optional)`} value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" error={errors.target} />
        </Card>
      )}
      {sections.includes("lifestyle") && (
        <Card style={{ gap: space.md }}>
          <Text style={font.h3}>Lifestyle & food</Text>
          <Text style={font.small}>Activity level (outside of logged workouts)</Text>
          <ChipRow options={Object.keys(ACTIVITY) as ActivityLevel[]} value={v.activity_level} onChange={(a) => set({ activity_level: a })} labels={ACTIVITY} />
          <Text style={font.small}>Primary goal</Text>
          <ChipRow options={Object.keys(GOALS) as Goal[]} value={v.primary_goal} onChange={(g) => set({ primary_goal: g })} labels={GOALS} />
          <Text style={font.small}>Dietary preferences</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {DIETS.map((d) => <ChipToggle key={d} label={d} on={v.dietary_preferences.includes(d)} onPress={() => set({ dietary_preferences: toggle(v.dietary_preferences, d) })} />)}
          </View>
          <Text style={font.small}>Allergies & restrictions</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {[...new Set([...ALLERGENS, ...v.allergies])].map((d) => <ChipToggle key={d} label={d} on={v.allergies.includes(d)} onPress={() => set({ allergies: toggle(v.allergies, d) })} />)}
          </View>
          <Row>
            <View style={{ flex: 1 }}><Field label="Other allergy" value={customAllergy} onChangeText={setCustomAllergy} maxLength={40} /></View>
            <Button title="Add" variant="secondary" style={{ marginTop: 22 }} onPress={() => { const a = customAllergy.trim().toLowerCase(); if (a) set({ allergies: [...new Set([...v.allergies, a])] }); setCustomAllergy(""); }} />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={[font.body, { flex: 1 }]}>Pregnant or breastfeeding</Text>
            <Switch value={v.pregnant_or_breastfeeding} onValueChange={(b) => set({ pregnant_or_breastfeeding: b })} accessibilityLabel="Pregnant or breastfeeding" />
          </Row>
        </Card>
      )}
      {(sections.includes("lifestyle") || sections.includes("targets")) && estimate && (
        <Card style={{ gap: space.sm }}>
          <Text style={font.h3}>Suggested daily target</Text>
          <Text style={[font.h1, { color: colors.primary }]}>{estimate.targetKcal} kcal</Text>
          <Text style={font.small}>Resting ≈ {estimate.bmrKcal} kcal · estimated daily expenditure ≈ {estimate.tdeeKcal} kcal</Text>
          <Text style={font.small}>Protein {estimate.proteinG} g · Carbs {estimate.carbsG} g · Fat {estimate.fatG} g</Text>
          {estimate.warnings.map((w) => <Notice key={w} tone="warning">{w}</Notice>)}
          {estimate.assumptions.map((a) => <Text key={a} style={font.tiny}>• {a}</Text>)}
          {sections.includes("targets") && <Button title="Use suggested targets" variant="secondary" onPress={applyEstimate} />}
        </Card>
      )}
      {sections.includes("targets") && (
        <Card style={{ gap: space.md }}>
          <Text style={font.h3}>Your targets</Text>
          <Field label="Calories (kcal/day)" value={String(v.calorie_target_kcal)} onChangeText={(t) => set({ calorie_target_kcal: Number(t) || 0, calorie_target_is_manual: true })} keyboardType="number-pad" error={errors.kcal} />
          <Row>
            <View style={{ flex: 1 }}><Field label="Protein (g)" value={String(v.protein_target_g)} onChangeText={(t) => set({ protein_target_g: Number(t) || 0 })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Carbs (g)" value={String(v.carbohydrate_target_g)} onChangeText={(t) => set({ carbohydrate_target_g: Number(t) || 0 })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Fat (g)" value={String(v.fat_target_g)} onChangeText={(t) => set({ fat_target_g: Number(t) || 0 })} keyboardType="number-pad" /></View>
          </Row>
          <Field label="Water goal (ml/day)" value={String(v.water_target_ml)} onChangeText={(t) => set({ water_target_ml: Number(t) || 0 })} keyboardType="number-pad" error={errors.water} />
          <Text style={font.small}>Remaining calories</Text>
          <ChipRow options={["base", "exercise_adjusted"] as const} value={v.budget_method} onChange={(b) => set({ budget_method: b })} labels={{ base: "Food target only", exercise_adjusted: "Add logged exercise" }} />
          <Text style={font.tiny}>
            {v.budget_method === "base"
              ? "Remaining = target − food eaten. Exercise is shown separately and not added back."
              : "Remaining = target + estimated exercise calories − food eaten. Exercise estimates can be high; many people add back only part."}
          </Text>
        </Card>
      )}
      <Button title={submitLabel} onPress={submit} loading={busy} />
    </View>
  );
}

function ChipToggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Chip label={label} selected={on} onPress={onPress} />;
}
