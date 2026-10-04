#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL 15+/16 cluster, applies the Supabase shim and all
# migrations, then runs the RLS / data-isolation / meal-logging SQL tests.
# Requires PostgreSQL server binaries (initdb, pg_ctl) on PATH or PG_BIN set.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${PGTEST_PORT:-55432}"
cleanup() { "$PG_BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # PostgreSQL refuses to run as root; use the postgres/nobody user.
  U="$(id -u postgres >/dev/null 2>&1 && echo postgres || echo nobody)"
  chown -R "$U" "$TMP"
  RUN_AS=(runuser -u "$U" --)
fi

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/tests/db/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -c "grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
                 grant execute on all functions in schema public to authenticated;"
"${PSQL[@]}" -f "$ROOT/tests/db/rls_and_meals.test.sql"
