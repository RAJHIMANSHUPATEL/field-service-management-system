#!/usr/bin/env bash
# Backup and restore drill: dump the live database, restore it into a scratch database, and
# compare row counts table by table. Exits non-zero on any difference.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
url="$(grep -E '^DATABASE_URL=' "$here/backend/.env" | head -1 | cut -d= -f2- | tr -d '"')"
url="${url%%\?*}"
base="${url%/*}"
scratch="field_service_restore_drill"
start=$(date +%s)
dump_line="$(DATABASE_URL="$url" "$here/scripts/backup.sh" "$here/backups")"
dump="$(echo "$dump_line" | sed -nE 's/^database: ([^ ]+).*/\1/p')"
[ -f "$dump" ] || { echo "DRILL FAILED: no dump file"; exit 1; }
echo "$dump_line" | grep '^objects:' || true
psql "$base/postgres" -qAtc "DROP DATABASE IF EXISTS $scratch" >/dev/null
psql "$base/postgres" -qAtc "CREATE DATABASE $scratch" >/dev/null
"$here/scripts/restore.sh" "$dump" "$base/$scratch" >/dev/null
count() {
  psql "$1" -qAt <<'SQL'
SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT table_name AS t, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text::int AS n
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) s;
SQL
}
live="$(count "$url")"
restored="$(count "$base/$scratch")"
tables=$(echo "$live" | wc -w)
psql "$base/postgres" -qAtc "DROP DATABASE $scratch" >/dev/null
if [ "$live" != "$restored" ]; then
  echo "DRILL FAILED: row counts differ"; exit 1
fi
echo "drill ok: $tables tables, row counts identical, $(( $(date +%s) - start ))s, dump $(basename "$dump")"
