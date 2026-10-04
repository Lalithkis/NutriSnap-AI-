import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSignedImageUrl } from "@/api/queries";
import type { MealLog } from "@/api/types";
import { formatTime } from "@/lib/dates";
import { colors, font, MEAL_LABELS, radius, space } from "@/theme";

export function MealThumb({ path, size = 56 }: { path: string | null; size?: number }) {
  const url = useSignedImageUrl(path);
  if (path && url.data) return <Image source={{ uri: url.data }} style={{ width: size, height: size, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Meal photo" />;
  return <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: size * 0.45 }}>🍽️</Text></View>;
}

export function MealCard({ meal }: { meal: MealLog }) {
  const names = meal.meal_items.map((i) => i.display_name).join(", ");
  const label = meal.meal_type === "other" && meal.custom_meal_name ? meal.custom_meal_name : MEAL_LABELS[meal.meal_type];
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/meal/[id]", params: { id: meal.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${label} at ${formatTime(meal.logged_at)}, ${meal.total_calories_kcal} kilocalories: ${names}`}
      style={({ pressed }) => ({ flexDirection: "row", gap: space.md, alignItems: "center", padding: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}
    >
      <MealThumb path={meal.image_storage_path} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.h3}>{label} <Text style={font.tiny}>· {formatTime(meal.logged_at)}</Text></Text>
        <Text style={font.small} numberOfLines={2}>{names || "No items"}</Text>
        <Text style={font.tiny}>P {Math.round(meal.total_protein_g)}g · C {Math.round(meal.total_carbs_g)}g · F {Math.round(meal.total_fat_g)}g{meal.analysis_status === "saved_unconfirmed" ? " · ⚠︎ unconfirmed estimate" : ""}</Text>
      </View>
      <Text style={[font.h3, { color: colors.primary }]}>{meal.total_calories_kcal}<Text style={font.tiny}> kcal</Text></Text>
    </Pressable>
  );
}
