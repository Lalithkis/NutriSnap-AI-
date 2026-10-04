import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Linking, Share, Switch, Text, View } from "react-native";
import { useProfile, useUpdateProfile } from "@/api/queries";
import { Button, Card, Field, Notice, Row, Screen, SectionTitle } from "@/components/ui";
import { invokeFunction, supabase } from "@/lib/supabase";
import { colors, font, space } from "@/theme";

export default function Settings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [cam, setCam] = useState<string>("unknown");
  const [lib, setLib] = useState<string>("unknown");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    ImagePicker.getCameraPermissionsAsync().then((p) => setCam(p.status)).catch(() => {});
    ImagePicker.getMediaLibraryPermissionsAsync().then((p) => setLib(p.status)).catch(() => {});
  }, []);

  const consent = !!profile.data?.ai_consent_at;

  const exportData = async () => {
    setBusy("export");
    try {
      const tables = ["profiles", "meal_logs", "meal_items", "activity_logs", "water_logs", "weight_logs", "saved_meals", "food_favorites", "food_corrections", "assistant_messages"] as const;
      const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw new Error(error.message);
        out[t] = data;
      }
      await Share.share({ message: JSON.stringify(out, null, 2), title: "NutriSnap data export" });
    } catch (e) { Alert.alert("Export failed", (e as Error).message); }
    setBusy(null);
  };

  const deleteAllPhotos = async () => {
    setBusy("photos");
    try {
      const { data: meals, error } = await supabase.from("meal_logs").select("id,image_storage_path").not("image_storage_path", "is", null);
      if (error) throw new Error(error.message);
      const paths = (meals ?? []).map((m) => m.image_storage_path as string);
      for (let i = 0; i < paths.length; i += 100) {
        const { error: e } = await supabase.storage.from("meal-images").remove(paths.slice(i, i + 100));
        if (e) throw new Error(e.message);
      }
      await supabase.from("meal_logs").update({ image_storage_path: null }).not("image_storage_path", "is", null);
      await qc.invalidateQueries();
      Alert.alert("Done", `${paths.length} photo(s) deleted. Your meal logs were kept.`);
    } catch (e) { Alert.alert("Couldn't delete photos", (e as Error).message); }
    setBusy(null);
  };

  const deleteAccount = async () => {
    setBusy("account");
    try {
      await invokeFunction("delete-account", { confirm: "DELETE" });
      await supabase.auth.signOut();
      qc.clear();
    } catch (e) { Alert.alert("Couldn't delete account", (e as Error).message); }
    setBusy(null);
  };

  return (
    <Screen edges={[]}>
      <SectionTitle title="Privacy" />
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>AI photo recognition</Text>
            <Text style={font.tiny}>Meal photos are sent to Anthropic's API only to identify foods. Turning this off keeps manual logging available.</Text>
          </View>
          <Switch value={consent} onValueChange={(on) => update.mutate({ ai_consent_at: on ? new Date().toISOString() : null })} accessibilityLabel="AI photo recognition" />
        </Row>
        <Button title="Export my data" variant="secondary" loading={busy === "export"} onPress={exportData} />
        <Button title="Delete all meal photos" variant="secondary" loading={busy === "photos"} onPress={() => Alert.alert("Delete all photos?", "Meal logs and nutrition stay; only photos are removed.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: deleteAllPhotos }])} />
      </Card>

      <SectionTitle title="Permissions" />
      <Card style={{ gap: space.sm }}>
        <Text style={font.body}>Camera: <Text style={{ color: cam === "granted" ? colors.success : colors.warning }}>{cam}</Text></Text>
        <Text style={font.body}>Photo library: <Text style={{ color: lib === "granted" ? colors.success : colors.warning }}>{lib}</Text></Text>
        <Text style={font.tiny}>Used only when you choose to photograph or pick a meal. Health Connect / Apple Health are not used by this build.</Text>
        <Button title="Open device settings" variant="ghost" onPress={() => Linking.openSettings()} />
      </Card>

      <SectionTitle title="About estimates" />
      <Card style={{ gap: 6 }}>
        <Text style={font.small}>• Food nutrition comes from the NutriSnap catalog (curated estimates for typical recipes) or USDA FoodData Central. Recipes, oil and portions vary.</Text>
        <Text style={font.small}>• Photo portions are AI estimates and are never treated as exact.</Text>
        <Text style={font.small}>• Activity calories are MET-based estimates.</Text>
        <Text style={font.small}>• NutriSnap is not a medical device. If you are pregnant, under 18, managing a medical condition, or have a history of disordered eating, please work with a clinician or registered dietitian.</Text>
      </Card>

      <SectionTitle title="Account" />
      <Card style={{ gap: space.md }}>
        <Button title="Sign out" variant="secondary" onPress={async () => { await supabase.auth.signOut(); qc.clear(); }} />
        <Notice tone="danger">Deleting your account permanently removes your profile, logs, photos and assistant history. This can't be undone.</Notice>
        <Field label='Type DELETE to confirm' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
        <Button title="Delete account" variant="danger" disabled={confirmText !== "DELETE"} loading={busy === "account"} onPress={deleteAccount} />
      </Card>
    </Screen>
  );
}
