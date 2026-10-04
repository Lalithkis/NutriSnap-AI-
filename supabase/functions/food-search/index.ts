/**
 * POST /functions/v1/food-search  { q: string }
 * Searches the local catalog; if there are few results and FDC_API_KEY is set,
 * queries USDA FoodData Central and caches the results with provenance.
 */
import { z } from "zod";
import { adminClient, authenticate, env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { cacheFdcFoods, searchFdc } from "../_shared/fdc.ts";

const Body = z.object({ q: z.string().trim().min(2).max(80), include_remote: z.boolean().default(true) });

Deno.serve(handler(async (req) => {
  const { user, userClient } = await authenticate(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalid_input", "Search text must be 2–80 characters");
  const { q, include_remote } = parsed.data;

  const { data: local, error } = await userClient.rpc("search_foods", { q, max_results: 25 });
  if (error) throw error;
  let remote: unknown[] = [];
  let remoteStatus: "skipped" | "not_configured" | "ok" | "unavailable" = "skipped";
  const fdcKey = env("FDC_API_KEY");
  if (include_remote && (local?.length ?? 0) < 5) {
    if (!fdcKey) remoteStatus = "not_configured";
    else {
      const admin = adminClient();
      await enforceRateLimit(admin, user.id, "food-search-remote", { perHour: 120, perDay: 500 });
      const found = await searchFdc(q, fdcKey);
      remote = found.length ? await cacheFdcFoods(admin, found) : [];
      remoteStatus = found.length ? "ok" : "unavailable";
    }
  }
  const seen = new Set<string>();
  const results = [...(local ?? []), ...remote].filter((f) => {
    const id = (f as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return json({ results, remote_status: remoteStatus });
}));
