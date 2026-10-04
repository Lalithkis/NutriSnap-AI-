# NutriSnap AI — Smart Diet, Nutrition & Fitness Tracker

Take a meal photo → AI identifies each food and estimates portions → nutrition is calculated from a food database → you confirm or correct → the meal is saved and your dashboard updates.

React Native (Expo SDK 57, Expo Router, TypeScript) · Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · Claude vision for food identification · NutriSnap food catalog + USDA FoodData Central for nutrition.

> Photo-based calories are **estimates**. A photo can't show exact weight, hidden ingredients or cooking oil. NutriSnap shows uncertainty, asks you to confirm every item, and never presents estimates as lab-accurate or as medical advice.

---

## Architecture

```
┌──────────────── Mobile app (Expo / React Native) ────────────────┐
│ Expo Router screens ─ React Query hooks ─ meal-draft state        │
│ Shared pure logic (@shared/*): nutrition math, daily totals,      │
│ energy targets, activity METs, food matching                      │
└───────┬───────────────────────────┬───────────────────────────────┘
        │ supabase-js (user JWT)    │ functions.invoke (user JWT)
        ▼                           ▼
┌──────────────── Supabase ─────────────────────────────────────────┐
│ Postgres + RLS: profiles, meal_logs, meal_items, activity_logs,   │
│   water_logs, weight_logs, saved_meals, food_favorites,           │
│   food_corrections, ai_analysis_jobs, assistant_messages, ...     │
│   save_meal() RPC (atomic, idempotent) · totals trigger           │
│ Storage: private `meal-images` bucket, <user_id>/ folder policy   │
│ Edge Functions (Deno, secrets server-side only):                  │
│   analyze-meal ─► Claude vision (identify + portion only)         │
│               └─► catalog / USDA FDC match ─► nutrition math      │
│   food-search ─► catalog, USDA FDC fallback + cache               │
│   assistant   ─► Claude tool use over the user's own RLS data     │
│   delete-account                                                  │
└───────────────────────────────────────────────────────────────────┘
```

Key design rules (all enforced in code and covered by tests):

* **Recognition is separate from nutrition.** The vision model returns only names, alternatives, portion/weight estimates, confidence and notes (validated against a JSON schema + zod). Nutrition is always `per-100 g value × confirmed grams / 100` from a food database row. Model-supplied numbers are never used for nutrition.
* **Unknown stays unknown.** Missing fibre/sugar/etc. are `null`, not `0`. Unmatched foods have no nutrition until the user picks a food or types label values (marked `user_entered`).
* **User confirmation.** AI items start unconfirmed. Saving needs "Confirm all & save" or the explicit "Save as unconfirmed estimate", which is labelled everywhere.
* **Energy figures are kept separate:** food eaten, estimated exercise, estimated TDEE (in goals), remaining vs. base target, remaining vs. exercise-adjusted target (only if enabled), and net intake with a note that it isn't full energy balance.
* **Local days.** Totals use the device's IANA time zone (`localDayBounds`, DST-safe).
* **Every write invalidates all cached ranges**, and a DB trigger recomputes per-meal totals on item insert/update/delete, so dashboard, diary and charts update immediately.

### Folder structure

```
src/
  app/                    Expo Router routes
    (auth)/               welcome, sign-in, sign-up, forgot-password (OTP recovery)
    (tabs)/               index (dashboard), diary, scan, activity, profile
    meal/                 review (AI results + portion editing), success, [id] (details/edit)
    onboarding.tsx goals.tsx food-search.tsx water.tsx progress.tsx
    assistant.tsx favorites.tsx settings.tsx activity-log.tsx
  api/                    React Query hooks + row types
  components/             UI kit, charts (SVG), item editor, profile form
  lib/                    supabase client, auth, upload, dates, units
  state/mealDraft.tsx     in-memory meal being reviewed
supabase/
  migrations/             schema, RLS, storage policies, RPCs; generated food catalog
  catalog/                foods.ts (source of truth for the catalog) + SQL generator
  functions/              _shared/ (pure logic + server helpers) and 4 edge functions
  seed.sql                DEV ONLY demo account and sample logs
  config.toml             local Supabase CLI config
tests/
  unit/                   vitest: nutrition, energy, activity, daily totals, AI schema, pipeline
  db/                     Postgres shim + RLS / data-isolation / meal-logging SQL tests
e2e/                      Maestro flows (photo→diary, manual entry)
scripts/test-db.sh        throwaway Postgres runner for the DB tests
docs/                     deployment, API integrations, testing, limitations
```

---

## Setup

Prerequisites: Node 22+, npm, the [Supabase CLI](https://supabase.com/docs/guides/cli), Docker (for local Supabase), and Android Studio / Xcode or a physical device with a development build.

```bash
npm install
cp .env.example .env               # fill in after starting Supabase (below)
cp supabase/.env.example supabase/.env
```

### 1. Backend (local)

```bash
supabase start                      # starts Postgres, Auth, Storage, Edge runtime
supabase db reset                   # applies migrations + seed (demo@nutrisnap.dev / demo-password-123)
supabase status                     # copy API URL + anon key into .env
```

Edge function secrets (`supabase/.env`):

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for photo recognition & assistant | Claude API key from console.anthropic.com |
| `VISION_MODEL`, `ASSISTANT_MODEL` | no | Override model ids (default `claude-opus-5-5`) |
| `FDC_API_KEY` | no | USDA FoodData Central key for foods missing from the local catalog |

```bash
supabase functions serve --env-file supabase/.env
```

Without `ANTHROPIC_API_KEY` the app still works: the scan screen shows "Photo recognition unavailable" and offers manual entry; the assistant shows a not-configured message. Without `FDC_API_KEY` search uses the built-in catalog and says so.

### 2. App

```bash
npx expo run:android      # or: npx expo run:ios   (builds a dev client)
# later: npx expo start --dev-client
```

When running on a physical device, replace `127.0.0.1` in `EXPO_PUBLIC_SUPABASE_URL` with your computer's LAN IP. If `.env` is missing the app shows a "Setup required" screen instead of failing.

**Password recovery** uses a 6-digit email code. Locally the template in `supabase/templates/recovery.html` is used (view emails at the Inbucket URL from `supabase status`). In a hosted project, edit *Auth → Email templates → Reset password* to include `{{ .Token }}`.

---

## Testing

| Command | What it covers | Status in this repo |
|---|---|---|
| `npm run typecheck` | App + shared code (`tsc`), edge functions against a Deno shim | ✅ passing |
| `npm run typecheck:deno` | Edge functions with real Deno (`deno check`) | ✅ passing (Deno 2) |
| `npm test` | 122 vitest tests: nutrition math, catalog data quality (Atwater check on every food), energy targets + safeguards, MET estimates, duplicate-workout detection, DST-safe day bounds, daily totals, AI-output validation, food matching, photo→candidates pipeline, upload validation | ✅ passing |
| `npm run test:db` | Applies all migrations to a throwaway PostgreSQL 16 with a minimal Supabase shim, then tests: profile trigger, atomic + idempotent `save_meal`, totals after create/edit/delete, constraint validation, correction learning, **cross-user isolation** (read/update/delete/spoofed insert/RPC edit/item injection/storage folder), catalog read-only, anon access, account-deletion cascade | ✅ passing |
| `expo export --platform android` | Metro/Hermes bundle builds (route + alias resolution) | ✅ passing |
| `maestro test e2e/photo-to-diary.yaml` | Real device/emulator: sign in → pick photo → AI review → adjust → save → dashboard → delete | ⚠️ written, **not run here** (needs emulator, dev build, and an Anthropic key) |

CI (`.github/workflows/ci.yml`) runs every row except Maestro.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the production checklist (Supabase project, secrets, auth settings, EAS builds, store privacy labels) and [docs/API_INTEGRATIONS.md](docs/API_INTEGRATIONS.md) for the AI, USDA and health-platform integrations.

## Known limitations

Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Most importantly:

* **Health Connect / Apple HealthKit are not implemented.** The UI says so and steps show "not available". The data model (`source`, `external_activity_id`, duplicate detection) is ready for them.
* **The built-in catalog values are curated estimates** compiled from IFCT 2017 / USDA references and typical recipes (`verification = 'curated_estimate'`). Have a nutrition professional review them before a production launch. Foods fetched from USDA FDC are stored as `verified_source` with their FDC id.
* Reminder notifications are not implemented (a `user_preferences.reminders` column is reserved).
