/**
 * Activity energy estimates from MET values (Compendium of Physical Activities, 2011/2024).
 * kcal ≈ MET × body weight (kg) × duration (h). We report *gross* activity energy and
 * label it as an estimate. Body weight is required: we never assume one silently.
 */

export type Intensity = "light" | "moderate" | "vigorous";
export type ActivityType =
  | "walking" | "running" | "cycling" | "swimming" | "gym" | "strength"
  | "yoga" | "basketball" | "other";

export const MET_TABLE: Record<ActivityType, Record<Intensity, number>> = {
  walking: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
  running: { light: 7.0, moderate: 9.8, vigorous: 11.5 },
  cycling: { light: 4.0, moderate: 6.8, vigorous: 10.0 },
  swimming: { light: 5.8, moderate: 7.0, vigorous: 9.8 },
  gym: { light: 3.5, moderate: 5.0, vigorous: 8.0 },
  strength: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  yoga: { light: 2.3, moderate: 3.0, vigorous: 4.0 },
  basketball: { light: 4.5, moderate: 6.5, vigorous: 8.0 },
  other: { light: 3.0, moderate: 4.5, vigorous: 7.0 },
};

export function estimateActivityKcal(type: ActivityType, intensity: Intensity, durationMin: number, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0) return null;
  if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 24 * 60) throw new RangeError("Duration must be 1–1440 minutes");
  const met = MET_TABLE[type][intensity];
  return Math.round(met * weightKg * (durationMin / 60));
}

export interface ActivityRecord {
  id: string;
  activity_type: string;
  started_at: string; // ISO
  duration_minutes: number;
  calories_burned_kcal: number | null;
  source: string; // "manual" | "health_connect" | "healthkit"
}

/**
 * Remove probable duplicates (same workout imported and logged manually):
 * same activity type and time ranges overlapping by ≥50% of the shorter one.
 * Imported (device) records win over manual ones because they are measured.
 */
export function dedupeActivities<T extends ActivityRecord>(records: T[]): { kept: T[]; duplicates: T[] } {
  const rank = (r: T) => (r.source === "manual" ? 1 : 0);
  const sorted = [...records].sort((a, b) => rank(a) - rank(b) || a.started_at.localeCompare(b.started_at));
  const kept: T[] = [];
  const duplicates: T[] = [];
  for (const r of sorted) {
    const s = Date.parse(r.started_at), e = s + r.duration_minutes * 60000;
    const dup = kept.find((k) => {
      if (k.activity_type !== r.activity_type || k.source === r.source) return false;
      const ks = Date.parse(k.started_at), ke = ks + k.duration_minutes * 60000;
      const overlap = Math.min(e, ke) - Math.max(s, ks);
      const shorter = Math.min(e - s, ke - ks);
      return shorter > 0 && overlap / shorter >= 0.5;
    });
    if (dup) duplicates.push(r); else kept.push(r);
  }
  kept.sort((a, b) => a.started_at.localeCompare(b.started_at));
  return { kept, duplicates };
}
