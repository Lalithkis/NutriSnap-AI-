import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { summarizeDay, useMealSearch, useProfile, useRangeData, useSaveMeal } from "@/api/queries";
import type { MealLog } from "@/api/types";
import { MealCard } from "@/components/MealCard";
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { addDays, deviceTimeZone, formatDateLabel, formatTime, isoForLocalDate, localDayBounds, todayLocal, toLocalDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/upload";
import { useMealDraft } from "@/state/mealDraft";
import { colors, font, MEAL_LABELS, MEAL_ORDER, space } from "@/theme";

export default function Diary() {
  const tz = deviceTimeZone();
  const [date, setDate] = useState(todayLocal(tz));
  const [mode, setMode] = useState<"day" | "search">("day");
  const [q, setQ] = useState("");
  const profile = useProfile();
  const range = useRangeData(date, date, tz);
  const { start } = useMealDraft();
  const save = useSaveMeal();

  const meals = useMemo(() => (range.data?.meals ?? []).filter((m) => toLocalDate(m.logged_at, tz) === date), [range.data, date, tz]);
  const summary = range.data && profile.data ? summarizeDay(date, tz, range.data, profile.data) : null;

  const addManual = (mealType: (typeof MEAL_ORDER)[number]) => {
    start({ mode: "manual", mealType, loggedAt: isoForLocalDate(date, tz), imagePath: null, localImageUri: null, jobId: null, notes: "", questions: [], items: [] });
    router.push("/food-search");
  };

  const copyFrom = async (source: string) => {
    const b = localDayBounds(source, tz);
    const r = await supabase.from("meal_logs").select("meal_type,custom_meal_name,meal_items(*)").gte("logged_at", b.start.toISOString()).lt("logged_at", b.end.toISOString());
    if (r.error) return Alert.alert("Couldn't copy", r.error.message);
    const src = (r.data ?? []) as unknown as Pick<MealLog, "meal_type" | "custom_meal_name" | "meal_items">[];
    if (src.length === 0) return Alert.alert("Nothing to copy", `No meals were logged on ${formatDateLabel(source, tz)}.`);
    try {
      for (const m of src) {
        await save.mutateAsync({
          client_request_id: uuid(), logged_at: isoForLocalDate(date, tz), meal_type: m.meal_type, custom_meal_name: m.custom_meal_name, analysis_status: "manual",
          items: m.meal_items.map(({ id: _id, meal_log_id: _m, sort_order: _s, ...i }) => ({ ...i, user_confirmed: true, ai_suggested_name: null })),
        });
      }
    } catch (e) { Alert.alert("Couldn't copy", (e as Error).message); }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={font.h1} accessibilityRole="header">Diary</Text>
        <Button title={mode === "day" ? "Search" : "By day"} icon={mode === "day" ? "🔍" : "📅"} variant="secondary" style={{ minHeight: 40 }} onPress={() => setMode(mode === "day" ? "search" : "day")} />
      </Row>

      {mode === "search" ? <SearchEntries q={q} setQ={setQ} /> : (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <NavBtn label="‹" a11y="Previous day" onPress={() => setDate(addDays(date, -1))} />
            <Text style={font.h3}>{formatDateLabel(date, tz)}</Text>
            <NavBtn label="›" a11y="Next day" onPress={() => setDate(addDays(date, 1))} disabled={date >= todayLocal(tz)} />
          </Row>

          {range.isLoading ? <LoadingState /> : range.error ? <ErrorState message={range.error.message} onRetry={() => range.refetch()} /> : (
            <>
              {summary && (
                <Card style={{ flexDirection: "row", justifyContent: "space-around" }}>
                  <Mini label="kcal" value={summary.consumed.calories} />
                  <Mini label="protein" value={`${Math.round(summary.consumed.protein)}g`} />
                  <Mini label="carbs" value={`${Math.round(summary.consumed.carbs)}g`} />
                  <Mini label="fat" value={`${Math.round(summary.consumed.fat)}g`} />
                  <Mini label="fiber" value={`${Math.round(summary.consumed.fiber)}g`} />
                </Card>
              )}
              {MEAL_ORDER.map((t) => {
                const list = meals.filter((m) => m.meal_type === t);
                const kcal = list.reduce((a, m) => a + m.total_calories_kcal, 0);
                return (
                  <View key={t} style={{ gap: space.sm }}>
                    <SectionTitle title={`${MEAL_LABELS[t]}${kcal ? ` · ${kcal} kcal` : ""}`} action={{ label: "+ Add", onPress: () => addManual(t) }} />
                    {list.length === 0 ? <Text style={font.tiny}>Nothing logged</Text> : list.map((m) => <MealCard key={m.id} meal={m} />)}
                  </View>
                );
              })}
              <Card style={{ gap: space.sm }}>
                <Text style={font.h3}>Copy meals</Text>
                <Text style={font.small}>Copy every meal from another day into {formatDateLabel(date, tz)}.</Text>
                <Row>
                  <Button title="From previous day" variant="secondary" style={{ flex: 1 }} loading={save.isPending} onPress={() => copyFrom(addDays(date, -1))} />
                  <Button title="Saved meals" variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/favorites")} />
                </Row>
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function SearchEntries({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  const res = useMealSearch(q);
  return (
    <View style={{ gap: space.md }}>
      <Field label="Search your food history" value={q} onChangeText={setQ} placeholder="e.g. dosa" autoFocus />
      {res.isLoading ? <LoadingState /> : res.error ? <ErrorState message={res.error.message} /> : res.data?.length === 0 ? (
        <EmptyState icon="🔎" title="No matching entries" />
      ) : res.data?.map((r) => (
        <Pressable key={r.id} onPress={() => router.push({ pathname: "/meal/[id]", params: { id: r.meal_log_id } })} accessibilityRole="button">
          <Card style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>{r.display_name}</Text>
              <Text style={font.tiny}>{new Date(r.meal_logs.logged_at).toLocaleDateString()} · {formatTime(r.meal_logs.logged_at)} · {MEAL_LABELS[r.meal_logs.meal_type]} · {r.serving_quantity} × {r.serving_unit}</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>{r.calories_kcal} kcal</Text>
          </Card>
        </Pressable>
      ))}
      <Notice>Showing your 50 most recent matching items.</Notice>
    </View>
  );
}

function NavBtn({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled?: boolean; a11y: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={10}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}>
      <Text style={{ color: colors.text, fontSize: 24 }}>{label}</Text>
    </Pressable>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <View style={{ alignItems: "center" }}><Text style={font.h3}>{value}</Text><Text style={font.tiny}>{label}</Text></View>;
}
