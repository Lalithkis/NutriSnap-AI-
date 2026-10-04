import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { useProfile } from "@/api/queries";
import type { MealType } from "@/api/types";
import { Button, Card, ChipRow, Notice, Screen } from "@/components/ui";
import { analyzeMeal } from "@/lib/analyze";
import { useAuth } from "@/lib/auth";
import { suggestMealType } from "@/lib/dates";
import { ApiError } from "@/lib/supabase";
import { prepareAndUploadMealPhoto, uuid } from "@/lib/upload";
import { itemFromCandidate, useMealDraft } from "@/state/mealDraft";
import { colors, font, MEAL_LABELS, MEAL_ORDER, radius, space } from "@/theme";

type Phase = { kind: "idle" } | { kind: "permission"; which: "camera" | "library" } | { kind: "working"; step: string; uri: string } | { kind: "error"; message: string; code?: string; uri?: string };

export default function Scan() {
  const { session } = useAuth();
  const profile = useProfile();
  const { start } = useMealDraft();
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const consented = !!profile.data?.ai_consent_at;

  const startManual = () => {
    start({ mode: "manual", mealType, loggedAt: new Date().toISOString(), imagePath: null, localImageUri: null, jobId: null, notes: "", questions: [], items: [] });
    router.push("/food-search");
  };

  const pick = async (source: "camera" | "library") => {
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setPhase({ kind: "permission", which: source });
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, allowsEditing: false, exif: false };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (asset.mimeType && !/^image\/(jpeg|png|webp|heic|heif)$/.test(asset.mimeType)) {
      return setPhase({ kind: "error", message: "That file type isn't supported. Please choose a photo (JPEG, PNG, WebP or HEIC)." });
    }
    await run(asset.uri, asset.width);
  };

  const run = async (uri: string, width: number) => {
    const requestId = uuid();
    try {
      setPhase({ kind: "working", step: "Uploading photo securely…", uri });
      const { path, localUri } = await prepareAndUploadMealPhoto(uri, width, session!.user.id);
      setPhase({ kind: "working", step: "Identifying foods…", uri });
      const result = await analyzeMeal({ image_path: path, client_request_id: requestId, meal_type: mealType });
      start({
        mode: "photo", mealType, loggedAt: new Date().toISOString(), imagePath: path, localImageUri: localUri, jobId: result.job_id,
        notes: "", questions: result.clarification_questions, items: result.candidates.map(itemFromCandidate),
        clientRequestId: requestId,
      });
      setPhase({ kind: "idle" });
      if (!result.is_food || result.candidates.length === 0) {
        router.push({ pathname: "/meal/review", params: { notice: result.is_food ? "no_items" : "not_food" } });
      } else {
        router.push("/meal/review");
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setPhase({ kind: "error", message: (e as Error).message, code, uri });
    }
  };

  return (
    <Screen>
      <Text style={font.h1} accessibilityRole="header">Scan a meal</Text>
      <Text style={font.small}>Which meal is this?</Text>
      <ChipRow options={MEAL_ORDER} value={mealType} onChange={setMealType} labels={MEAL_LABELS} />

      {phase.kind === "working" ? (
        <Card style={{ alignItems: "center", gap: space.md }}>
          <Image source={{ uri: phase.uri }} style={{ width: "100%", aspectRatio: 1, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Selected meal photo" />
          <Text style={font.h3} accessibilityLiveRegion="polite">{phase.step}</Text>
          <Text style={font.tiny}>This usually takes 5–20 seconds.</Text>
        </Card>
      ) : (
        <>
          {!consented && (
            <Notice tone="warning">
              Photo recognition sends your meal photo to our AI provider. Enable it in Settings → Privacy, or add foods manually.
            </Notice>
          )}
          <Card style={{ alignItems: "center", gap: space.md, paddingVertical: space.xxl }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 56 }}>📸</Text>
            </View>
            <Text style={[font.small, { textAlign: "center" }]}>
              Tip: shoot from above in good light with the whole plate in frame. A spoon or hand nearby helps with portion size.
            </Text>
            <Button title="Take photo" icon="📷" style={{ alignSelf: "stretch" }} disabled={!consented} onPress={() => pick("camera")} />
            <Button title="Choose from gallery" icon="🖼️" variant="secondary" style={{ alignSelf: "stretch" }} disabled={!consented} onPress={() => pick("library")} />
          </Card>
          <Button title="Search & add foods manually" icon="✍️" variant="secondary" onPress={startManual} />
          {!consented && <Button title="Privacy settings" variant="ghost" onPress={() => router.push("/settings")} />}
        </>
      )}

      {phase.kind === "permission" && (
        <Notice tone="warning">
          <Text style={[font.small, { color: colors.text }]}>
            {phase.which === "camera" ? "Camera" : "Photo library"} access is off. NutriSnap only uses it when you choose to log a meal photo.
          </Text>
          <Button title="Open device settings" variant="ghost" onPress={() => Linking.openSettings()} />
        </Notice>
      )}
      {phase.kind === "error" && (
        <Card style={{ gap: space.sm, borderColor: colors.danger }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>
            {phase.code === "ai_not_configured" ? "Photo recognition unavailable" : phase.code === "rate_limited" ? "Limit reached" : "Couldn't analyse the photo"}
          </Text>
          <Text style={font.small}>{phase.message}</Text>
          {phase.code !== "ai_not_configured" && phase.code !== "rate_limited" && <Button title="Retake photo" variant="secondary" onPress={() => pick("camera")} />}
          <Button title="Add foods manually instead" variant="secondary" onPress={startManual} />
        </Card>
      )}
    </Screen>
  );
}
