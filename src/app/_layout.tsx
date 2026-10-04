import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useProfile } from "@/api/queries";
import { LoadingState } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isConfigured } from "@/lib/env";
import { MealDraftProvider } from "@/state/mealDraft";
import { colors, font, space } from "@/theme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 }, mutations: { retry: 0 } },
});
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));
AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

function Gate() {
  const { session, loading } = useAuth();
  const profile = useProfile();
  const segments = useSegments();
  const router = useRouter();
  const inAuth = segments[0] === "(auth)";
  const inOnboarding = segments[0] === "onboarding";

  useEffect(() => {
    if (loading) return;
    if (!session) {
      if (!inAuth) router.replace("/welcome");
      return;
    }
    if (profile.isLoading || !profile.data) return;
    if (!profile.data.onboarding_completed) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inAuth || inOnboarding) {
      router.replace("/");
    }
  }, [loading, session, profile.isLoading, profile.data, inAuth, inOnboarding, router]);

  if (loading || (session && profile.isLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: space.md }}>
        <Text style={{ fontSize: 48 }}>🥗</Text>
        <Text style={font.h1}>NutriSnap AI</Text>
        <LoadingState label="Starting up…" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg }, headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="meal/review" options={{ title: "Review meal" }} />
      <Stack.Screen name="meal/success" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="meal/[id]" options={{ title: "Meal details" }} />
      <Stack.Screen name="food-search" options={{ title: "Add food", presentation: "modal" }} />
      <Stack.Screen name="water" options={{ title: "Water" }} />
      <Stack.Screen name="progress" options={{ title: "Progress" }} />
      <Stack.Screen name="assistant" options={{ title: "Nutrition assistant" }} />
      <Stack.Screen name="favorites" options={{ title: "Favorites & saved meals" }} />
      <Stack.Screen name="settings" options={{ title: "Settings & privacy" }} />
      <Stack.Screen name="goals" options={{ title: "Goals" }} />
      <Stack.Screen name="activity-log" options={{ title: "Log activity", presentation: "modal" }} />
    </Stack>
  );
}

function SetupRequired() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: "center", gap: space.md }}>
      <Text style={font.h1}>Setup required</Text>
      <Text style={font.body}>
        NutriSnap can't connect to its backend because EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.
      </Text>
      <Text style={font.small}>Copy .env.example to .env, fill in your Supabase project values, then restart the dev server. See README → Setup.</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!isConfigured ? <SetupRequired /> : (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MealDraftProvider>
              <Gate />
            </MealDraftProvider>
          </AuthProvider>
        </QueryClientProvider>
      )}
    </SafeAreaProvider>
  );
}
