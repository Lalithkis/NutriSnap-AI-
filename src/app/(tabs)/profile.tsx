import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useProfile } from "@/api/queries";
import { Card, ErrorState, LoadingState, Screen } from "@/components/ui";
import { fmtVolume, fmtWeight } from "@/lib/units";
import { colors, font, space } from "@/theme";

const LINKS = [
  { icon: "🎯", title: "Goals & body", sub: "Targets, weight, activity level, diet", href: "/goals" },
  { icon: "📈", title: "Progress", sub: "Trends, weight history, reports", href: "/progress" },
  { icon: "💧", title: "Water", sub: "Today and history", href: "/water" },
  { icon: "⭐", title: "Favourites & saved meals", sub: "Reuse meals in one tap", href: "/favorites" },
  { icon: "💬", title: "Nutrition assistant", sub: "Ask about your logs", href: "/assistant" },
  { icon: "⚙️", title: "Settings & privacy", sub: "Permissions, data, account", href: "/settings" },
] as const;

export default function Profile() {
  const profile = useProfile();
  if (profile.isLoading) return <Screen><LoadingState /></Screen>;
  if (!profile.data) return <Screen><ErrorState message="Couldn't load profile" onRetry={() => profile.refetch()} /></Screen>;
  const p = profile.data;
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 4 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryDark, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 34, color: colors.text, fontWeight: "700" }}>{p.display_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={font.h1}>{p.display_name}</Text>
        <Text style={font.small}>{p.calorie_target_kcal} kcal · {fmtWeight(p.current_weight_kg, p.preferred_units)}{p.target_weight_kg ? ` → ${fmtWeight(p.target_weight_kg, p.preferred_units)}` : ""} · {fmtVolume(p.water_target_ml, p.preferred_units)} water</Text>
      </View>
      {LINKS.map((l) => (
        <Pressable key={l.href} onPress={() => router.push(l.href)} accessibilityRole="button" accessibilityLabel={l.title}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text style={{ fontSize: 26 }}>{l.icon}</Text>
            <View style={{ flex: 1 }}><Text style={font.h3}>{l.title}</Text><Text style={font.tiny}>{l.sub}</Text></View>
            <Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
