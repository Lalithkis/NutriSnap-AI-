import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { summarizeDay, useAddWater, useProfile, useRangeData } from "@/api/queries";
import { BarChart, MacroBar, ProgressRing } from "@/components/charts";
import { MealCard } from "@/components/MealCard";
import { Button, Card, EmptyState, ErrorState, LoadingState, Notice, OfflineBanner, Row, SectionTitle } from "@/components/ui";
import { addDays, deviceTimeZone, todayLocal, toLocalDate } from "@/lib/dates";
import { fmtVolume } from "@/lib/units";
import { colors, font, space } from "@/theme";

export default function Home() {
  const tz = deviceTimeZone();
  const today = todayLocal(tz);
  const weekStart = addDays(today, -6);
  const profile = useProfile();
  const range = useRangeData(weekStart, today, tz);
  const addWater = useAddWater();

  const days = useMemo(() => {
    if (!range.data || !profile.data) return [];
    const out = [];
    for (let d = weekStart; d <= today; d = addDays(d, 1)) out.push(summarizeDay(d, tz, range.data, profile.data));
    return out;
  }, [range.data, profile.data, weekStart, today, tz]);

  if (profile.isLoading || range.isLoading) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><LoadingState label="Loading your day…" /></SafeAreaView>;
  if (!profile.data || !range.data) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}><ErrorState message={(range.error ?? profile.error)?.message ?? "Couldn't load data"} onRetry={() => { profile.refetch(); range.refetch(); }} /></SafeAreaView>;
  }

  const p = profile.data;
  const s = days[days.length - 1];
  const todaysMeals = range.data.meals.filter((m) => toLocalDate(m.logged_at, tz) === today);
  const todaysActs = range.data.activities.filter((a) => toLocalDate(a.started_at, tz) === today);
  const steps = todaysActs.reduce((a, x) => a + (x.steps ?? 0), 0);
  const remaining = p.budget_method === "exercise_adjusted" ? s.remainingAdjustedKcal : s.remainingBaseKcal;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={range.isRefetching} onRefresh={() => range.refetch()} tintColor={colors.primary} />}
      >
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text style={font.small}>{greeting},</Text>
            <Text style={font.h1}>{p.display_name}</Text>
          </View>
          <Pressable onPress={() => router.push("/assistant")} accessibilityRole="button" accessibilityLabel="Open nutrition assistant" style={{ padding: 10, backgroundColor: colors.surface, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 22 }}>💬</Text>
          </Pressable>
        </Row>

        <Card style={{ alignItems: "center", gap: space.lg }}>
          <ProgressRing
            progress={s.consumed.calories / Math.max(1, s.budgetKcal)}
            label={`${s.consumed.calories} of ${s.budgetKcal} kilocalories eaten, ${Math.abs(remaining)} ${remaining >= 0 ? "remaining" : "over"}`}
          >
            <Text style={[font.h1, { fontSize: 36 }]}>{Math.abs(remaining)}</Text>
            <Text style={font.small}>{remaining >= 0 ? "kcal remaining" : "kcal over target"}</Text>
          </ProgressRing>
          <Row style={{ justifyContent: "space-around", alignSelf: "stretch" }}>
            <Stat label="Food eaten" value={s.consumed.calories} color={colors.primary} />
            <Stat label="Exercise (est.)" value={s.activityKcal} color={colors.activity} />
            <Stat label="Target" value={s.baseTargetKcal} color={colors.textMuted} />
          </Row>
          <Text style={[font.tiny, { textAlign: "center" }]}>
            {p.budget_method === "exercise_adjusted"
              ? `Remaining includes ${s.activityKcal} kcal of estimated exercise (target ${s.baseTargetKcal} + exercise − food).`
              : "Remaining = food target − food eaten. Exercise is tracked separately and not added back (change in Goals)."}
            {" "}Net intake (food − exercise) {s.netIntakeKcal} kcal doesn't include resting metabolism, so it isn't your full energy balance.
          </Text>
          {s.unconfirmedMealCount > 0 && <Notice tone="warning">{`${s.unconfirmedMealCount} meal(s) saved as unconfirmed AI estimates are included.`}</Notice>}
        </Card>

        <Card style={{ gap: space.md }}>
          <MacroBar label="Protein" value={s.consumed.protein} target={p.protein_target_g} color={colors.protein} />
          <MacroBar label="Carbs" value={s.consumed.carbs} target={p.carbohydrate_target_g} color={colors.carbs} />
          <MacroBar label="Fat" value={s.consumed.fat} target={p.fat_target_g} color={colors.fat} />
        </Card>

        <Row>
          <Card style={{ flex: 1, gap: space.sm }}>
            <Text style={font.small}>💧 Water</Text>
            <Text style={font.h2}>{fmtVolume(s.waterMl, p.preferred_units)}</Text>
            <Text style={font.tiny}>of {fmtVolume(p.water_target_ml, p.preferred_units)}</Text>
            <Row style={{ gap: space.sm }}>
              <Button title="+250" variant="secondary" style={{ flex: 1, minHeight: 44, paddingHorizontal: 4 }} loading={addWater.isPending} onPress={() => addWater.mutate({ volume_ml: 250 })} accessibilityHint="Adds 250 millilitres of water" />
              <Button title="More" variant="ghost" style={{ minHeight: 44, paddingHorizontal: 4 }} onPress={() => router.push("/water")} />
            </Row>
          </Card>
          <Pressable style={{ flex: 1 }} onPress={() => router.push("/activity")} accessibilityRole="button">
            <Card style={{ gap: space.sm, flex: 1 }}>
              <Text style={font.small}>🔥 Activity</Text>
              <Text style={font.h2}>{s.activityMinutes} min</Text>
              <Text style={font.tiny}>{s.activityKcal} kcal estimated</Text>
              <Text style={font.tiny}>Steps: {steps > 0 ? steps.toLocaleString() : "not available"}</Text>
            </Card>
          </Pressable>
        </Row>

        <SectionTitle title="Today's meals" action={{ label: "Diary", onPress: () => router.push("/diary") }} />
        {todaysMeals.length === 0 ? (
          <Card><EmptyState icon="🍽️" title="Nothing logged yet" body="Snap a photo of your next meal or add foods manually." action={{ label: "Scan a meal", onPress: () => router.push("/scan") }} /></Card>
        ) : todaysMeals.map((m) => <MealCard key={m.id} meal={m} />)}

        <SectionTitle title="This week" action={{ label: "Progress", onPress: () => router.push("/progress") }} />
        <Card style={{ gap: space.sm }}>
          <Text style={font.small}>Calories eaten vs target (dashed)</Text>
          <BarChart label="Calories per day this week" data={days.map((d) => ({ label: d.date.slice(8), value: d.mealCount ? d.consumed.calories : null }))} target={p.calorie_target_kcal} unit=" kcal" />
          <Text style={font.small}>Exercise calories (estimated)</Text>
          <BarChart label="Exercise calories per day" height={100} color={colors.activity} data={days.map((d) => ({ label: d.date.slice(8), value: d.activityKcal || null }))} unit=" kcal" />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center" }} accessible accessibilityLabel={`${label}: ${value} kilocalories`}>
      <Text style={[font.h2, { color }]}>{value}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}
