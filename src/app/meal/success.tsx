import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui";
import { colors, font, space } from "@/theme";

export default function Success() {
  const { id, kcal, edited } = useLocalSearchParams<{ id: string; kcal: string; edited?: string }>();
  useEffect(() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: "center", gap: space.lg }}>
      <View style={{ alignItems: "center", gap: space.sm }} accessibilityLiveRegion="polite">
        <Text style={{ fontSize: 72 }}>✅</Text>
        <Text style={font.h1}>{edited ? "Meal updated" : "Meal logged"}</Text>
        <Text style={font.body}>{kcal} kcal added to your diary.</Text>
        <Text style={font.small}>Your daily totals have been updated.</Text>
      </View>
      <Button title="Back to dashboard" onPress={() => router.replace("/")} />
      <Button title="View meal" variant="secondary" onPress={() => router.replace({ pathname: "/meal/[id]", params: { id } })} />
      <Button title="Log another meal" variant="ghost" onPress={() => router.replace("/scan")} />
    </View>
  );
}
