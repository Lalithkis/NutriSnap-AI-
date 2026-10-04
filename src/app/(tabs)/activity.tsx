import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { dedupeActivities } from "@shared/activity.ts";
import { useDeleteActivity, useProfile, useRangeData } from "@/api/queries";
import { BarChart } from "@/components/charts";
import { Button, Card, EmptyState, ErrorState, LoadingState, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { addDays, deviceTimeZone, formatDateLabel, formatTime, todayLocal, toLocalDate } from "@/lib/dates";
import { fmtDistance } from "@/lib/units";
import { ACTIVITY_ICONS, ACTIVITY_LABELS, colors, font, space } from "@/theme";

export default function Activity() {
  const tz = deviceTimeZone();
  const today = todayLocal(tz);
  const [date, setDate] = useState(today);
  const start = addDays(today, -6) < date ? addDays(today, -6) : date;
  const profile = useProfile();
  const range = useRangeData(start, today, tz);
  const del = useDeleteActivity();

  const dayActs = useMemo(() => (range.data?.activities ?? []).filter((a) => toLocalDate(a.started_at, tz) === date), [range.data, date, tz]);
  const { kept, duplicates } = dedupeActivities(dayActs);
  const dupIds = new Set(duplicates.map((d) => d.id));
  const kcal = kept.reduce((a, x) => a + (x.calories_burned_kcal ?? 0), 0);
  const mins = kept.reduce((a, x) => a + x.duration_minutes, 0);
  const steps = dayActs.reduce((a, x) => a + (x.steps ?? 0), 0);

  const week = useMemo(() => {
    const out: { label: string; value: number | null }[] = [];
    for (let d = addDays(today, -6); d <= today; d = addDays(d, 1)) {
      const acts = dedupeActivities((range.data?.activities ?? []).filter((a) => toLocalDate(a.started_at, tz) === d)).kept;
      out.push({ label: d.slice(8), value: acts.length ? acts.reduce((a, x) => a + x.duration_minutes, 0) : null });
    }
    return out;
  }, [range.data, today, tz]);

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={font.h1} accessibilityRole="header">Activity</Text>
        <Button title="Log" icon="＋" style={{ minHeight: 40 }} onPress={() => router.push("/activity-log")} />
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Pressable onPress={() => setDate(addDays(date, -1))} accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={10}><Text style={{ color: colors.text, fontSize: 24 }}>‹</Text></Pressable>
        <Text style={font.h3}>{formatDateLabel(date, tz)}</Text>
        <Pressable onPress={() => date < today && setDate(addDays(date, 1))} accessibilityRole="button" accessibilityLabel="Next day" hitSlop={10}><Text style={{ color: date < today ? colors.text : colors.border, fontSize: 24 }}>›</Text></Pressable>
      </Row>
      {range.isLoading ? <LoadingState /> : range.error ? <ErrorState message={range.error.message} onRetry={() => range.refetch()} /> : (
        <>
          <Card style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <Big label="kcal burned (est.)" value={String(kcal)} color={colors.activity} />
            <Big label="active minutes" value={String(Math.round(mins))} color={colors.primary} />
            <Big label="steps" value={steps > 0 ? steps.toLocaleString() : "—"} color={colors.protein} />
          </Card>
          <Text style={font.tiny}>
            Exercise calories are estimates (MET × body weight × time) of the energy used during the activity. They are not your total daily energy expenditure.
            {steps === 0 ? " Steps aren't available: no step source is connected." : ""}
          </Text>
          {!profile.data?.current_weight_kg && <Notice tone="warning">Add your weight in Goals so activity calories can be estimated.</Notice>}
          {duplicates.length > 0 && <Notice>{duplicates.length} entr{duplicates.length > 1 ? "ies look" : "y looks"} like a duplicate of an imported workout and {duplicates.length > 1 ? "are" : "is"} not counted.</Notice>}
          <SectionTitle title="Workouts" />
          {dayActs.length === 0 ? <EmptyState icon="🏃" title="No activity logged" body="Log a walk, run, yoga session or any workout." action={{ label: "Log activity", onPress: () => router.push("/activity-log") }} /> : dayActs.map((a) => (
            <Pressable key={a.id} onLongPress={() => Alert.alert("Delete activity?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => del.mutate(a.id) }])}
              onPress={() => router.push({ pathname: "/activity-log", params: { id: a.id } })} accessibilityRole="button" accessibilityHint="Tap to edit, long-press to delete">
              <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center", opacity: dupIds.has(a.id) ? 0.5 : 1 }}>
                <Text style={{ fontSize: 30 }}>{ACTIVITY_ICONS[a.activity_type] ?? "⚡"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{a.custom_name || ACTIVITY_LABELS[a.activity_type]}</Text>
                  <Text style={font.tiny}>{formatTime(a.started_at)} · {Math.round(a.duration_minutes)} min · {a.intensity}{a.distance_m ? ` · ${fmtDistance(a.distance_m, profile.data?.preferred_units ?? "metric")}` : ""} · {a.source === "manual" ? "manual" : "imported"}{dupIds.has(a.id) ? " · duplicate (not counted)" : ""}</Text>
                </View>
                <Text style={{ color: colors.activity, fontWeight: "700" }}>{a.calories_burned_kcal != null ? `${a.calories_burned_kcal} kcal` : "kcal n/a"}</Text>
              </Card>
            </Pressable>
          ))}
          <SectionTitle title="Last 7 days (minutes)" />
          <Card><BarChart label="Active minutes per day" data={week} color={colors.activity} unit=" min" /></Card>
          <Card style={{ gap: space.sm }}>
            <Text style={font.h3}>Health Connect / Apple Health</Text>
            <Text style={font.small}>Automatic import of steps and workouts isn't available in this build. It requires a native development build with the health modules — see README → Health integrations. Until then, log workouts manually.</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Big({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={{ alignItems: "center" }}><Text style={[font.h2, { color }]}>{value}</Text><Text style={font.tiny}>{label}</Text></View>;
}
