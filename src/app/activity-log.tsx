import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { estimateActivityKcal, MET_TABLE, type ActivityType, type Intensity } from "@shared/activity.ts";
import { useProfile, useSaveActivity } from "@/api/queries";
import { Button, Card, ChipRow, Field, Notice, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_LABELS, colors, font, space } from "@/theme";

const TYPES = Object.keys(MET_TABLE) as ActivityType[];

export default function ActivityLog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profile = useProfile();
  const save = useSaveActivity();
  const imperial = profile.data?.preferred_units === "imperial";
  const [type, setType] = useState<ActivityType>("walking");
  const [customName, setCustomName] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [minutes, setMinutes] = useState("30");
  const [distance, setDistance] = useState("");
  const [minsAgo, setMinsAgo] = useState("0");
  const [kcalOverride, setKcalOverride] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("activity_logs").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      setType(data.activity_type); setCustomName(data.custom_name ?? ""); setIntensity(data.intensity);
      setMinutes(String(Number(data.duration_minutes))); setDistance(data.distance_m ? String(Math.round((Number(data.distance_m) / (imperial ? 1609.34 : 1000)) * 100) / 100) : "");
      setKcalOverride(data.calories_burned_kcal != null ? String(data.calories_burned_kcal) : "");
      setMinsAgo(String(Math.max(0, Math.round((Date.now() - Date.parse(data.started_at)) / 60000))));
    });
  }, [id, imperial]);

  const dur = Number(minutes);
  const estimate = useMemo(() => {
    if (!Number.isFinite(dur) || dur <= 0 || dur > 1440) return null;
    return estimateActivityKcal(type, intensity, dur, profile.data?.current_weight_kg ?? null);
  }, [type, intensity, dur, profile.data?.current_weight_kg]);

  const submit = () => {
    setError(null);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 1440) return setError("Duration must be between 1 and 1440 minutes");
    const ago = Number(minsAgo) || 0;
    const d = distance.trim() ? Number(distance.replace(",", ".")) : null;
    if (d != null && (!Number.isFinite(d) || d < 0)) return setError("Distance must be a number");
    const override = kcalOverride.trim() ? Number(kcalOverride) : null;
    if (override != null && (!Number.isFinite(override) || override < 0 || override > 10000)) return setError("Calories must be 0–10000");
    save.mutate({
      id, activity_type: type, custom_name: type === "other" ? customName.trim() || null : null, intensity,
      started_at: new Date(Date.now() - (ago + dur) * 60000).toISOString(), duration_minutes: dur,
      distance_m: d == null ? null : Math.round(d * (imperial ? 1609.34 : 1000)),
      calories_burned_kcal: override ?? estimate,
    }, { onSuccess: () => router.back(), onError: (e) => setError(e.message) });
  };

  return (
    <Screen edges={[]}>
      <Text style={font.small}>Activity</Text>
      <ChipRow options={TYPES} value={type} onChange={setType} labels={ACTIVITY_LABELS} />
      {type === "other" && <Field label="Activity name" value={customName} onChangeText={setCustomName} maxLength={60} />}
      <Text style={font.small}>Intensity</Text>
      <ChipRow options={["light", "moderate", "vigorous"] as const} value={intensity} onChange={setIntensity} labels={{ light: "Light", moderate: "Moderate", vigorous: "Vigorous" }} />
      <Field label="Duration (minutes)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Field label={`Distance (${imperial ? "mi" : "km"}, optional)`} value={distance} onChangeText={setDistance} keyboardType="decimal-pad" />
      <Field label="Finished how many minutes ago?" value={minsAgo} onChangeText={setMinsAgo} keyboardType="number-pad" />
      <Card style={{ gap: space.sm }}>
        <Text style={font.h3}>Estimated calories</Text>
        {estimate != null ? <Text style={[font.h1, { color: colors.activity }]}>{estimate} kcal</Text> : <Text style={font.small}>Unavailable — add your body weight in Goals to estimate.</Text>}
        <Text style={font.tiny}>MET {MET_TABLE[type][intensity]} × {profile.data?.current_weight_kg ?? "?"} kg × {Number.isFinite(dur) ? (dur / 60).toFixed(2) : "?"} h. An estimate only; individual values vary.</Text>
        <Field label="Use a value from your device instead (optional)" value={kcalOverride} onChangeText={setKcalOverride} keyboardType="number-pad" />
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title={id ? "Save changes" : "Log activity"} loading={save.isPending} onPress={submit} />
    </Screen>
  );
}
