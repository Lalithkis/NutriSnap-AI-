import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { lbToKg } from "@shared/energy.ts";
import { summarizeDay, useAddWeight, useAllWeights, useDeleteWeight, useProfile, useRangeData } from "@/api/queries";
import { BarChart, LineChart } from "@/components/charts";
import { Button, Card, ChipRow, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { addDays, deviceTimeZone, todayLocal, toLocalDate } from "@/lib/dates";
import { fmtWeight } from "@/lib/units";
import { colors, font, space } from "@/theme";

type Period = "day" | "week" | "month" | "quarter" | "custom";
const DAYS: Record<Exclude<Period, "custom">, number> = { day: 1, week: 7, month: 30, quarter: 90 };

export default function Progress() {
  const tz = deviceTimeZone();
  const today = todayLocal(tz);
  const [period, setPeriod] = useState<Period>("week");
  const [customStart, setCustomStart] = useState(addDays(today, -13));
  const [customEnd, setCustomEnd] = useState(today);
  const validCustom = /^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) && customStart <= customEnd && customEnd <= today
    && (Date.parse(customEnd) - Date.parse(customStart)) / 86400000 <= 366;
  const start = period === "custom" ? (validCustom ? customStart : addDays(today, -6)) : addDays(today, -(DAYS[period] - 1));
  const end = period === "custom" && validCustom ? customEnd : today;

  const profile = useProfile();
  const range = useRangeData(start, end, tz);
  const weights = useAllWeights();
  const addWeight = useAddWeight();
  const delWeight = useDeleteWeight();
  const [weightText, setWeightText] = useState("");
  const units = profile.data?.preferred_units ?? "metric";

  const days = useMemo(() => {
    if (!range.data || !profile.data) return [];
    const out = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(summarizeDay(d, tz, range.data, profile.data));
    return out;
  }, [range.data, profile.data, start, end, tz]);

  if (profile.isLoading || range.isLoading) return <Screen edges={[]}><LoadingState /></Screen>;
  if (!profile.data || range.error) return <Screen edges={[]}><ErrorState message={range.error?.message ?? "Couldn't load"} onRetry={() => range.refetch()} /></Screen>;
  const p = profile.data;

  const logged = days.filter((d) => d.mealCount > 0);
  const avg = (f: (d: (typeof days)[number]) => number, list = logged) => (list.length ? Math.round(list.reduce((a, d) => a + f(d), 0) / list.length) : null);
  const lbl = (d: string) => (days.length > 14 ? d.slice(5) : d.slice(8));
  const inRange = logged.filter((d) => Math.abs(d.consumed.calories - p.calorie_target_kcal) <= p.calorie_target_kcal * 0.1).length;
  const actDays = days.filter((d) => d.activityMinutes > 0);

  const ws = [...(weights.data ?? [])].reverse();
  const wsInPeriod = ws.filter((w) => { const d = toLocalDate(w.measured_at, tz); return d >= start && d <= end; });
  const latest = weights.data?.[0];
  const first = ws[0];

  const submitWeight = () => {
    const n = Number(weightText.replace(",", "."));
    const kg = units === "imperial" ? lbToKg(n) : n;
    if (!Number.isFinite(kg) || kg < 25 || kg > 350) return Alert.alert("Enter a valid weight");
    addWeight.mutate({ weight_kg: Math.round(kg * 100) / 100 }, { onSuccess: () => setWeightText("") });
  };

  return (
    <Screen edges={[]}>
      <ChipRow options={["day", "week", "month", "quarter", "custom"] as const} value={period} onChange={setPeriod}
        labels={{ day: "Today", week: "7 days", month: "30 days", quarter: "90 days", custom: "Custom" }} />
      {period === "custom" && (
        <Row>
          <View style={{ flex: 1 }}><Field label="From (YYYY-MM-DD)" value={customStart} onChangeText={setCustomStart} /></View>
          <View style={{ flex: 1 }}><Field label="To" value={customEnd} onChangeText={setCustomEnd} /></View>
        </Row>
      )}
      {period === "custom" && !validCustom && <Notice tone="warning">Enter a valid range of up to 366 days ending today or earlier.</Notice>}

      <Card style={{ gap: space.sm }}>
        <Text style={font.h3}>Summary</Text>
        {logged.length === 0 ? <Text style={font.small}>No meals logged in this period yet.</Text> : (
          <>
            <Text style={font.body}>Average intake <Text style={{ color: colors.primary, fontWeight: "700" }}>{avg((d) => d.consumed.calories)} kcal</Text> on days you logged (target {p.calorie_target_kcal}).</Text>
            <Text style={font.small}>Protein {avg((d) => d.consumed.protein)} g · Carbs {avg((d) => d.consumed.carbs)} g · Fat {avg((d) => d.consumed.fat)} g</Text>
            <Text style={font.small}>Logged meals on {logged.length} of {days.length} days · {inRange} day(s) within ±10% of your target</Text>
          </>
        )}
        <Text style={font.small}>Exercise: {actDays.length} active day(s), {Math.round(days.reduce((a, d) => a + d.activityMinutes, 0))} min, ≈{days.reduce((a, d) => a + d.activityKcal, 0)} kcal (estimated)</Text>
        <Text style={font.small}>Water: average {avg((d) => d.waterMl, days.filter((d) => d.waterMl > 0)) ?? 0} ml on days logged (goal {p.water_target_ml} ml)</Text>
        <Text style={font.tiny}>Averages only include days with entries, so missing days don't drag them down. Every day is a fresh start.</Text>
      </Card>

      <SectionTitle title="Calories vs target" />
      <Card><BarChart label="Calories per day" data={days.map((d) => ({ label: lbl(d.date), value: d.mealCount ? d.consumed.calories : null }))} target={p.calorie_target_kcal} unit=" kcal" /></Card>

      <SectionTitle title="Macros (g per day)" />
      <Card style={{ gap: space.sm }}>
        <Text style={[font.small, { color: colors.protein }]}>Protein (target {p.protein_target_g} g)</Text>
        <BarChart label="Protein per day" height={110} color={colors.protein} target={p.protein_target_g} data={days.map((d) => ({ label: lbl(d.date), value: d.mealCount ? d.consumed.protein : null }))} unit=" g" />
        <Text style={[font.small, { color: colors.carbs }]}>Carbohydrates (target {p.carbohydrate_target_g} g)</Text>
        <BarChart label="Carbohydrates per day" height={110} color={colors.carbs} target={p.carbohydrate_target_g} data={days.map((d) => ({ label: lbl(d.date), value: d.mealCount ? d.consumed.carbs : null }))} unit=" g" />
        <Text style={[font.small, { color: colors.fat }]}>Fat (target {p.fat_target_g} g)</Text>
        <BarChart label="Fat per day" height={110} color={colors.fat} target={p.fat_target_g} data={days.map((d) => ({ label: lbl(d.date), value: d.mealCount ? d.consumed.fat : null }))} unit=" g" />
      </Card>

      <SectionTitle title="Activity" />
      <Card style={{ gap: space.sm }}>
        <Text style={font.small}>Estimated exercise kcal</Text>
        <BarChart label="Exercise calories per day" height={110} color={colors.activity} data={days.map((d) => ({ label: lbl(d.date), value: d.activityKcal || null }))} unit=" kcal" />
        <Text style={font.small}>Workout minutes</Text>
        <BarChart label="Workout minutes per day" height={110} color={colors.primary} data={days.map((d) => ({ label: lbl(d.date), value: d.activityMinutes || null }))} unit=" min" />
      </Card>

      <SectionTitle title="Water" />
      <Card><BarChart label="Water per day" height={110} color={colors.water} target={p.water_target_ml} data={days.map((d) => ({ label: lbl(d.date), value: d.waterMl || null }))} unit=" ml" /></Card>

      <SectionTitle title="Weight" />
      <Card style={{ gap: space.md }}>
        {wsInPeriod.length >= 2 ? (
          <LineChart label="Weight history" points={wsInPeriod.map((w) => ({ label: toLocalDate(w.measured_at, tz).slice(5), value: units === "imperial" ? Math.round(w.weight_kg * 22.0462) / 10 : w.weight_kg }))} unit={units === "imperial" ? " lb" : " kg"} />
        ) : <Text style={font.small}>Log your weight on two or more days in this period to see a trend.</Text>}
        {latest && <Text style={font.small}>Latest {fmtWeight(latest.weight_kg, units)}{first && first.id !== latest.id ? ` · change since first entry ${fmtWeight(Math.round((latest.weight_kg - first.weight_kg) * 10) / 10, units)}` : ""}{p.target_weight_kg ? ` · goal ${fmtWeight(p.target_weight_kg, units)}` : ""}</Text>}
        <Text style={font.tiny}>Day-to-day weight naturally fluctuates by 1–2 kg with water and food. Look at the trend over weeks.</Text>
        <Row>
          <View style={{ flex: 1 }}><Field label={`Today's weight (${units === "imperial" ? "lb" : "kg"})`} value={weightText} onChangeText={setWeightText} keyboardType="decimal-pad" /></View>
          <Button title="Log" style={{ marginTop: 22 }} loading={addWeight.isPending} onPress={submitWeight} />
        </Row>
        {(weights.data ?? []).slice(0, 5).map((w) => (
          <Row key={w.id} style={{ justifyContent: "space-between" }}>
            <Text style={font.small}>{new Date(w.measured_at).toLocaleDateString()} · {fmtWeight(w.weight_kg, units)}</Text>
            <Pressable onPress={() => delWeight.mutate(w.id)} accessibilityRole="button" accessibilityLabel="Delete weight entry" hitSlop={10}><Text style={{ color: colors.danger }}>Delete</Text></Pressable>
          </Row>
        ))}
        {!weights.data?.length && <EmptyState icon="⚖️" title="No weight entries yet" />}
      </Card>
    </Screen>
  );
}
