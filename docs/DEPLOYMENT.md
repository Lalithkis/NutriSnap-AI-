# Production deployment

## 1. Supabase project
1. Create a project (choose a region close to your users; consider data-residency rules such as India's DPDP Act or GDPR).
2. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations`, including the food catalog). **Do not** run `seed.sql` in production.
3. Auth settings:
   * Enable email confirmations, set minimum password length ≥ 8, enable leaked-password protection.
   * Reset-password template must contain `{{ .Token }}` (the app uses code-based recovery).
   * Configure a custom SMTP provider (the default sender is rate-limited).
4. Storage: the migration creates the private `meal-images` bucket (8 MB, image MIME types) and folder-scoped policies. Verify it is **not public**.
5. Secrets: `supabase secrets set ANTHROPIC_API_KEY=... FDC_API_KEY=...`
6. Functions: `supabase functions deploy` (JWT verification is on for all four).
7. Optional: schedule cleanup of old `rate_limit_events` and failed `ai_analysis_jobs` (e.g. `pg_cron` daily `delete ... where created_at < now() - interval '7 days'`).

The `Deploy backend` GitHub workflow automates steps 2 and 6 (needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` secrets).

## 2. Mobile builds (EAS)
```bash
npx eas-cli@latest login
npx eas-cli@latest init           # sets the EAS project id
npx eas-cli@latest secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
npx eas-cli@latest secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform all
```
Only the public URL and anon key ship in the app. The service-role key, Anthropic key and FDC key must never be added to EAS env or `.env` for the app.

## 3. Store listings & compliance
* Privacy labels / Data safety: health & fitness data, photos, email; linked to the user; not used for tracking; deletable in-app (Settings → Delete account).
* Provide a privacy policy URL that names Anthropic as a sub-processor for meal photos and assistant messages.
* App Review notes: explain that calorie values are estimates and the app is not a medical device.

## 4. Monitoring
* Edge function logs never include image contents, prompts or personal data — keep it that way when adding logging.
* Watch `ai_analysis_jobs.error_code` counts for provider outages and malformed outputs.
