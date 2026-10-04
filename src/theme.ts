export const colors = {
  bg: "#0B1220",
  surface: "#121B2E",
  surfaceAlt: "#18233A",
  border: "#24324D",
  text: "#F1F5F9",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  primary: "#34D399",
  primaryDark: "#059669",
  onPrimary: "#04261A",
  protein: "#60A5FA",
  carbs: "#FBBF24",
  fat: "#F472B6",
  water: "#38BDF8",
  activity: "#FB923C",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const font = {
  h1: { fontSize: 28, fontWeight: "700" as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: "700" as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textFaint },
};

export const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning snack",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
  other: "Other",
};
export const MEAL_ORDER = ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner", "other"] as const;

export const ACTIVITY_LABELS: Record<string, string> = {
  walking: "Walking", running: "Running", cycling: "Cycling", swimming: "Swimming", gym: "Gym workout",
  strength: "Strength training", yoga: "Yoga", basketball: "Basketball", other: "Other",
};
export const ACTIVITY_ICONS: Record<string, string> = {
  walking: "🚶", running: "🏃", cycling: "🚴", swimming: "🏊", gym: "🏋️", strength: "💪", yoga: "🧘", basketball: "🏀", other: "⚡",
};
