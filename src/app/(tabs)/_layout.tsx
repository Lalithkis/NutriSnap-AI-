import { Tabs } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { colors } from "@/theme";

const icon = (glyph: string) => ({ color, focused }: { color: ColorValue; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6, color }}>{glyph}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 84, paddingTop: 8 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("🏠") }} />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: icon("📖") }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan meal",
          tabBarAccessibilityLabel: "Scan a meal",
          tabBarIcon: () => (
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: -26, borderWidth: 4, borderColor: colors.bg, shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 }}>
              <Text style={{ fontSize: 26 }}>📷</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: icon("🏃") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
