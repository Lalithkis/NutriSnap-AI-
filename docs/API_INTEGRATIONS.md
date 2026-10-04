# API integrations

## Claude (food recognition + assistant)
* Called only from edge functions (`supabase/functions/_shared/vision.ts`, `assistant/index.ts`) with the official `@anthropic-ai/sdk`.
* Vision: `client.beta.messages.create` with structured output (`output_config.format` = JSON schema in `analysis-schema.ts`), server-side refusal fallback (`fallbacks: "default"`), effort `medium`. Output is re-validated with zod; malformed items are dropped individually and a fully malformed response returns `ai_malformed`.
* Errors are mapped to user-facing codes: `ai_not_configured` (503), `ai_rate_limited`/`rate_limited` (429 + Retry-After), `ai_timeout` (504), `ai_unavailable` (502), `ai_refused` (422). The app retries transient errors once with the same idempotency key.
* Per-user limits: analyze-meal 20/hour, 60/day; assistant 40/hour, 150/day (`rate_limit_events`).
* Assistant tools read data through the caller's RLS-scoped client, so the model can only see that user's rows. Tool results state when data is missing.

## USDA FoodData Central
* Get a free key at https://fdc.nal.usda.gov/api-key-signup and set `FDC_API_KEY`.
* Used when the local catalog has < 5 matches (food-search) or a photo item has no catalog match (analyze-meal). Results with complete core macros are cached into `food_items` with `data_source='usda_fdc'`, `external_source_id=<fdcId>`, `verification='verified_source'`.

## Regional Indian foods
* `supabase/catalog/foods.ts` holds ~75 foods (South/North Indian dishes, staples, snacks, beverages + international foods) with serving sizes and per-100 g values. Values are curated estimates referencing IFCT 2017 (NIN, Hyderabad) and USDA; composite dishes assume typical home recipes. Update the file and run `npm run catalog:sql` to regenerate the migration; `tests/unit/nutrition.test.ts` checks every row for plausibility and Atwater consistency.
* For production, consider licensing IFCT 2017 data or the INDB (Indian Nutrient Databank) and importing with proper source ids.

## Health Connect (Android) / HealthKit (iOS) — not implemented
Planned approach:
1. Add `react-native-health-connect` (Android) and `@kingstinct/react-native-healthkit` (iOS) with their Expo config plugins; requires a dev build (not Expo Go).
2. Request read permissions for steps, exercise sessions and active energy only, with an in-app explanation screen.
3. Import into `activity_logs` with `source = 'health_connect' | 'healthkit'` and `external_activity_id` (unique per user+source, so re-imports upsert).
4. Duplicate manual entries are already excluded from totals by `dedupeActivities` (same type, ≥50% time overlap; imported wins).
Until then, the app shows steps as "not available" rather than inventing values.
