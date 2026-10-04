import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, Screen } from "@/components/ui";
import { colors, font, space } from "@/theme";

const STEPS = [
  { icon: "📸", title: "Snap your meal", body: "Take a photo — AI identifies each food and estimates portions." },
  { icon: "✏️", title: "Confirm & correct", body: "You stay in control: adjust foods and portions before anything is saved." },
  { icon: "📊", title: "See your day", body: "Calories, macros, water and activity, kept clearly separate." },
];

export default function Welcome() {
  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: space.xxl, gap: space.sm }}>
        <Text style={{ fontSize: 64 }} accessibilityLabel="NutriSnap logo">🥗</Text>
        <Text style={[font.h1, { fontSize: 34 }]}>NutriSnap AI</Text>
        <Text style={[font.small, { textAlign: "center" }]}>Nutrition logging as easy as taking a photo.</Text>
      </View>
      {STEPS.map((s) => (
        <Card key={s.title} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Text style={{ fontSize: 30 }}>{s.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>{s.title}</Text>
            <Text style={font.small}>{s.body}</Text>
          </View>
        </Card>
      ))}
      <Text style={[font.tiny, { textAlign: "center" }]}>
        Photo-based calories are estimates. NutriSnap is not a medical device and does not provide medical advice.
      </Text>
      <Button title="Create account" onPress={() => router.push("/sign-up")} />
      <Button title="I already have an account" variant="secondary" onPress={() => router.push("/sign-in")} />
      <Text style={{ color: colors.textFaint, textAlign: "center", fontSize: 12 }}>v1.0</Text>
    </Screen>
  );
}
