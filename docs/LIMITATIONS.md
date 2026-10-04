# Limitations & honest status

| Area | Status |
|---|---|
| Account, onboarding, goals, diary, manual logging, edit/delete/duplicate/copy, favourites, water, weight, activity, analytics | Implemented against Supabase; DB logic and isolation tested with SQL tests; UI typechecked and bundled, not exercised on a device in this environment |
| AI photo recognition | Implemented (Claude vision + schema validation + catalog matching). Requires `ANTHROPIC_API_KEY`; not called live in this environment |
| AI assistant | Implemented with tool use over the user's own data. Requires `ANTHROPIC_API_KEY`; not called live here |
| USDA FDC lookup | Implemented; requires `FDC_API_KEY`; not called live here |
| Health Connect / HealthKit / step counter | **Not implemented** (see API_INTEGRATIONS.md). Shown as unavailable in the UI |
| Push reminders | Not implemented |
| Offline | Reads come from React Query's in-memory cache; an offline banner is shown and writes fail with a clear message. There is no offline write queue |
| Food catalog accuracy | Curated estimates; needs professional review before production |
| Light theme | Dark theme only |
| Date input | Text fields (YYYY-MM-DD) rather than a native date picker |
| Energy targets | Mifflin–St Jeor for adults; disabled deficits for under-18s, pregnancy/breastfeeding and underweight BMI; floors of 1200/1350/1500 kcal. Not medical advice |
