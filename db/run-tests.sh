#!/usr/bin/env bash
# 임시 PostgreSQL 클러스터를 띄워 마이그레이션을 적용하고 RLS 보안 테스트를 실행한다.
# 필요: PostgreSQL 15+ (initdb, pg_ctl, psql). root로 실행하면 postgres 사용자로 실행한다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

cleanup() {
  as_pg "'$PGBIN/pg_ctl' -D '$WORK/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[ "$(id -u)" = "0" ] && chown postgres "$WORK"
as_pg "'$PGBIN/initdb' -D '$WORK/data' -U postgres -A trust -E UTF8 --locale=C" >/dev/null
as_pg "'$PGBIN/pg_ctl' -D '$WORK/data' -o '-p $PORT -k $WORK -c listen_addresses=' -l '$WORK/log' -w start" >/dev/null

PSQL=("$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
cat "$ROOT/db/tests/00_supabase_shim.sql" "$ROOT"/db/migrations/*.sql "$ROOT/db/tests/10_rls_test.sql" \
  | "${PSQL[@]}" 2>&1 | sed 's/^psql:<stdin>:[0-9]*: //'
