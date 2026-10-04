import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radius, space } from "@/theme";

export function Screen({ children, scroll = true, padded = true, edges = ["top"] }: { children: ReactNode; scroll?: boolean; padded?: boolean; edges?: ("top" | "bottom")[] }) {
  const content = <View style={[padded && { padding: space.lg, gap: space.lg }, !scroll && { flex: 1 }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <OfflineBanner />
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text style={{ color: colors.bg, fontWeight: "600" }}>You're offline — changes can't be saved until you reconnect.</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ title, onPress, variant = "primary", disabled, loading, icon, style, accessibilityHint }: {
  title: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean; icon?: string; style?: StyleProp<ViewStyle>; accessibilityHint?: string;
}) {
  const bg = { primary: colors.primary, secondary: colors.surfaceAlt, ghost: "transparent", danger: "#3B1A22" }[variant];
  const fg = { primary: colors.onPrimary, secondary: colors.text, ghost: colors.primary, danger: colors.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, variant === "secondary" && { borderWidth: 1, borderColor: colors.border }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: "700", fontSize: 16 }}>{icon ? `${icon}  ` : ""}{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={font.small}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...props}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={font.tiny}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((o) => <Chip key={o} label={labels?.[o] ?? o} selected={o === value} onPress={() => onChange(o)} />)}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: space.md }, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={font.h2} accessibilityRole="header">{title}</Text>
      {action && <Pressable onPress={action.onPress} hitSlop={12} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: "600" }}>{action.label}</Text></Pressable>}
    </Row>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: "center", padding: space.xl, gap: space.sm }}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={[font.h3, { textAlign: "center" }]}>{title}</Text>
      {body && <Text style={[font.small, { textAlign: "center" }]}>{body}</Text>}
      {action && <Button title={action.label} onPress={action.onPress} variant="secondary" style={{ marginTop: space.sm }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.danger, gap: space.sm }}>
      <Text style={{ color: colors.danger, fontWeight: "700" }}>Something went wrong</Text>
      <Text style={font.small}>{message}</Text>
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    </Card>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: space.sm }} accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={font.small}>{label}</Text>
    </View>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: ReactNode }) {
  const c = tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : colors.protein;
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: c, backgroundColor: colors.surfaceAlt, padding: space.md, borderRadius: radius.sm }}>
      {typeof children === "string" ? <Text style={[font.small, { color: colors.text }]}>{children}</Text> : children}
    </View>
  );
}

export function Stepper({ value, onChange, step = 0.5, min = 0.25, max = 50, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <Row style={{ gap: space.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => set(value - step)} style={styles.stepBtn}><Text style={styles.stepTxt}>−</Text></Pressable>
      <Text style={[font.h3, { minWidth: 44, textAlign: "center" }]} accessibilityLabel={`${label} ${value}`}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => set(value + step)} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></Pressable>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, color: colors.text, paddingHorizontal: space.md, fontSize: 16 },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  offline: { backgroundColor: colors.warning, padding: space.sm, alignItems: "center" },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepTxt: { color: colors.text, fontSize: 22, fontWeight: "700" },
});
