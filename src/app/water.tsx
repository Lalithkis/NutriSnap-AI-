import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useAddWater, useDeleteWater, useProfile, useRangeData } from "@/api/queries";
import { BarChart, ProgressRing } from "@/components/charts";
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { addDays, deviceTimeZone, formatTime, todayLocal, toLocalDate } from "@/lib/dates";
import { fmtVolume } from "@/lib/units";
import { colors, font, space } from "@/theme";

export default function Water() {
  const tz = deviceTimeZone();
  const today = todayLocal(tz);
  const profile = useProfile();
  const range = useRangeData(addDays(today, -6), today, tz);
  const add = useAddWater();
  const del = useDeleteWater();
  const [custom, setCustom] = useState("");
  const imperial = profile.data?.preferred_units === "imperial";
  const quick = imperial ? [{ l: "8 oz", ml: 237 }, { l: "12 oz", ml: 355 }, { l: "16 oz", ml: 473 }] : [{ l: "150 ml", ml: 150 }, { l: "250 ml", ml: 250 }, { l: "500 ml", ml: 500 }];

  const todayLogs = (range.data?.water ?? []).filter((w) => toLocalDate(w.logged_at, tz) === today).reverse();
  const total = todayLogs.reduce((a, w) => a + w.volume_ml, 0);
  const goal = profile.data?.water_target_ml ?? 2500;
  const week = useMemo(() => {
    const out: { label: string; value: number | null }[] = [];
    for (let d = addDays(today, -6); d <= today; d = addDays(d, 1)) {
      const v = (range.data?.water ?? []).filter((w) => toLocalDate(w.logged_at, tz) === d).reduce((a, w) => a + w.volume_ml, 0);
      out.push({ label: d.slice(8), value: v || null });
    }
    return out;
  }, [range.data, today, tz]);

  const addCustom = () => {
    const n = Number(custom.replace(",", "."));
    const ml = imperial ? Math.round(n * 29.5735) : Math.round(n);
    if (!Number.isFinite(n) || ml < 1 || ml > 5000) return Alert.alert("Enter an amount between 1 and 5000 ml");
    add.mutate({ volume_ml: ml }, { onSuccess: () => setCustom("") });
  };

  if (range.isLoading || profile.isLoading) return <Screen edges={[]}><LoadingState /></Screen>;
  if (range.error) return <Screen edges={[]}><ErrorState message={range.error.message} onRetry={() => range.refetch()} /></Screen>;

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: "center" }}>
        <ProgressRing progress={total / goal} color={colors.water} size={180} label={`${total} of ${goal} millilitres`}>
          <Text style={font.h1}>{fmtVolume(total, imperial ? "imperial" : "metric")}</Text>
          <Text style={font.small}>of {fmtVolume(goal, imperial ? "imperial" : "metric")}</Text>
        </ProgressRing>
      </View>
      <Row>{quick.map((q) => <Button key={q.l} title={`+${q.l}`} variant="secondary" style={{ flex: 1 }} loading={add.isPending && add.variables?.volume_ml === q.ml} onPress={() => add.mutate({ volume_ml: q.ml })} />)}</Row>
      <Row>
        <View style={{ flex: 1 }}><Field label={`Custom amount (${imperial ? "fl oz" : "ml"})`} value={custom} onChangeText={setCustom} keyboardType="decimal-pad" /></View>
        <Button title="Add" style={{ marginTop: 22 }} onPress={addCustom} />
      </Row>
      {add.error && <Notice tone="danger">{add.error.message}</Notice>}
      <SectionTitle title="Today" />
      {todayLogs.length === 0 ? <EmptyState icon="💧" title="No water logged yet today" /> : todayLogs.map((w) => (
        <Card key={w.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.md }}>
          <Text style={font.body}>💧 {fmtVolume(w.volume_ml, imperial ? "imperial" : "metric")} · <Text style={font.small}>{formatTime(w.logged_at)}</Text></Text>
          <Pressable onPress={() => del.mutate(w.id)} accessibilityRole="button" accessibilityLabel={`Delete ${w.volume_ml} millilitres at ${formatTime(w.logged_at)}`} hitSlop={12}>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete</Text>
          </Pressable>
        </Card>
      ))}
      <SectionTitle title="Last 7 days" />
      <Card><BarChart label="Water per day" data={week} target={goal} color={colors.water} unit=" ml" /></Card>
    </Screen>
  );
}
