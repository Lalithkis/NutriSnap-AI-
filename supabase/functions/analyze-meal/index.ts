/**
 * POST /functions/v1/analyze-meal
 * Body: { image_path: "<uid>/<file>.jpg", client_request_id: uuid, meal_type?: string }
 *
 * 1. Auth + input validation   2. Idempotency + rate limit
 * 3. Download & sniff the private image   4. Vision model (identification only)
 * 5. Match to food catalog (+ USDA FDC if configured)   6. Compute nutrition from the catalog
 * 7. Persist the job and return editable candidates (nothing is logged until the user confirms)
 */
import { z } from "zod";
import { adminClient, authenticate, env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { isOwnImagePath, MAX_IMAGE_BYTES, sniffImageType, toBase64 } from "../_shared/image.ts";
import { analyzeImage } from "../_shared/vision.ts";
import { buildCandidate, MATCH_THRESHOLD, type CatalogEntry, type Correction } from "../_shared/pipeline.ts";
import { MEAL_TYPES } from "../_shared/analysis-schema.ts";
import { cacheFdcFoods, searchFdc } from "../_shared/fdc.ts";

const Body = z.object({
  image_path: z.string().min(1).max(200),
  client_request_id: z.string().uuid(),
  meal_type: z.enum(MEAL_TYPES).optional(),
});

Deno.serve(handler(async (req) => {
  const { user } = await authenticate(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalid_input", "Invalid request");
  const { image_path, client_request_id, meal_type } = parsed.data;
  if (!isOwnImagePath(image_path, user.id)) throw new HttpError(403, "forbidden", "Invalid image path");

  const admin = adminClient();

  // Idempotency: a retried submission returns the existing result.
  const { data: existing } = await admin.from("ai_analysis_jobs")
    .select("id,status,result,error_code").eq("user_id", user.id).eq("client_request_id", client_request_id).maybeSingle();
  if (existing?.status === "succeeded") return json({ job_id: existing.id, ...existing.result });
  if (existing?.status === "processing") throw new HttpError(409, "in_progress", "This photo is already being analysed.");

  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new HttpError(503, "ai_not_configured", "Photo recognition isn't configured on this server. You can still add foods manually.");
  }
  await enforceRateLimit(admin, user.id, "analyze-meal", { perHour: 20, perDay: 60 });

  const jobId = existing?.id ?? crypto.randomUUID();
  const { error: jobErr } = await admin.from("ai_analysis_jobs").upsert({
    id: jobId, user_id: user.id, image_storage_path: image_path, client_request_id,
    status: "processing", provider: "anthropic", attempts: 1,
  }, { onConflict: "id" });
  if (jobErr) throw jobErr;

  const fail = async (code: string) => {
    await admin.from("ai_analysis_jobs").update({ status: "failed", error_code: code, completed_at: new Date().toISOString() }).eq("id", jobId);
  };

  try {
    const { data: blob, error: dlErr } = await admin.storage.from("meal-images").download(image_path);
    if (dlErr || !blob) throw new HttpError(404, "image_missing", "The photo upload could not be found. Please retake the photo.");
    if (blob.size > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large", "Photo is too large (max 8 MB).");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) throw new HttpError(415, "unsupported_image", "Please use a JPEG, PNG or WebP photo.");

    const { data: corrections } = await admin.from("food_corrections")
      .select("ai_name,corrected_food_item_id,corrected_name,typical_weight_g")
      .eq("user_id", user.id).order("times_used", { ascending: false }).limit(15);
    const corr = (corrections ?? []) as Correction[];

    const vision = await analyzeImage({
      apiKey,
      model: env("VISION_MODEL"),
      imageBase64: toBase64(bytes),
      mediaType,
      mealHint: meal_type,
      personalHints: corr.map((c) => `"${c.ai_name}" → "${c.corrected_name}"`),
    });

    // Gather candidate catalog rows for all names in parallel.
    const names = [...new Set(vision.result.items.flatMap((i) => [i.name, ...i.alternatives]))];
    const pools = await Promise.all(names.map((n) => admin.rpc("search_foods", { q: n, max_results: 8 })));
    const catalog = new Map<string, CatalogEntry>();
    for (const p of pools) for (const f of (p.data ?? []) as CatalogEntry[]) catalog.set(f.id, f);
    const correctionIds = corr.map((c) => c.corrected_food_item_id).filter((x): x is string => !!x);
    if (correctionIds.length) {
      const { data } = await admin.from("food_items").select("*").in("id", correctionIds);
      for (const f of (data ?? []) as CatalogEntry[]) catalog.set(f.id, f);
    }

    let candidates = vision.result.items.map((it) =>
      buildCandidate(it, [...catalog.values()], corr.find((c) => c.ai_name === it.name.toLowerCase())));

    // Fall back to USDA FDC for unmatched items when configured.
    const fdcKey = env("FDC_API_KEY");
    if (fdcKey && candidates.some((c) => !c.selectedFoodId)) {
      for (const c of candidates.filter((c) => !c.selectedFoodId)) {
        const cached = await cacheFdcFoods(admin, await searchFdc(c.ai.name, fdcKey)) as CatalogEntry[];
        for (const f of cached) catalog.set(f.id, f);
      }
      candidates = vision.result.items.map((it) =>
        buildCandidate(it, [...catalog.values()], corr.find((c) => c.ai_name === it.name.toLowerCase())));
    }

    const result = {
      is_food: vision.result.is_food,
      clarification_questions: vision.result.clarification_questions,
      overall_notes: vision.result.overall_notes,
      dropped_items: vision.droppedItems,
      match_threshold: MATCH_THRESHOLD,
      model: vision.model,
      candidates: candidates.map((c) => ({
        ai_name: c.ai.name,
        alternatives: c.ai.alternatives,
        is_beverage: c.ai.is_beverage,
        quantity: c.ai.quantity,
        unit: c.ai.unit,
        estimated_weight_g: c.weightG,
        weight_range_g: c.ai.weight_range_g ?? null,
        visible_ingredients: c.ai.visible_ingredients,
        cooking_method: c.ai.cooking_method,
        confidence: c.ai.confidence,
        selected_food_id: c.selectedFoodId,
        matches: c.matches.map((m) => ({ score: Math.round(m.score * 100) / 100, food: m.food })),
        nutrition: c.nutrition,
        needs_review: c.needsReview,
        review_reasons: c.reviewReasons,
        applied_personal_correction: c.appliedCorrection,
      })),
    };

    await admin.from("ai_analysis_jobs").update({
      status: "succeeded", model: vision.model, result, completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    return json({ job_id: jobId, ...result });
  } catch (e) {
    await fail(e instanceof HttpError ? e.code : "internal");
    throw e;
  }
}));
