import { addDays, localDayBounds, toLocalDate } from "@shared/daily.ts";

export const deviceTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};
export const todayLocal = (tz = deviceTimeZone()) => toLocalDate(new Date(), tz);
export { addDays, localDayBounds, toLocalDate };

export function formatDateLabel(date: string, tz = deviceTimeZone()): string {
  const today = todayLocal(tz);
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Combine a local date with the current local wall-clock time (for back-dated logging). */
export function isoForLocalDate(date: string, tz = deviceTimeZone()): string {
  if (date === todayLocal(tz)) return new Date().toISOString();
  const { start } = localDayBounds(date, tz);
  return new Date(start.getTime() + 12 * 3600_000).toISOString(); // midday on that day
}

export function suggestMealType(d = new Date()): "breakfast" | "morning_snack" | "lunch" | "evening_snack" | "dinner" {
  const h = d.getHours();
  if (h < 10) return "breakfast";
  if (h < 12) return "morning_snack";
  if (h < 15) return "lunch";
  if (h < 18) return "evening_snack";
  return "dinner";
}
