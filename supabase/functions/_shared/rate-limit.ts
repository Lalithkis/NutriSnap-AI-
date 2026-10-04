import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

/** Fixed-window limits per user and bucket. Uses the service-role client. */
export async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  bucket: string,
  limits: { perHour: number; perDay: number },
): Promise<void> {
  const now = Date.now();
  const hourAgo = new Date(now - 3600_000).toISOString();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const count = async (since: string) => {
    const { count, error } = await admin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("bucket", bucket).gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  };
  const [h, d] = await Promise.all([count(hourAgo), count(dayAgo)]);
  if (h >= limits.perHour) throw new HttpError(429, "rate_limited", "You've reached the hourly limit. Please try again later.", 600);
  if (d >= limits.perDay) throw new HttpError(429, "rate_limited", "You've reached today's limit. Please try again tomorrow.", 3600);
  const { error } = await admin.from("rate_limit_events").insert({ user_id: userId, bucket });
  if (error) throw error;
}
