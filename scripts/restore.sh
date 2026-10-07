#!/usr/bin/env bash
# Usage: scripts/restore.sh <dump-file> <target-database-url>. Restores into the target,
# which should be an empty database; it never touches DATABASE_URL unless you pass it.
set -euo pipefail
dump="${1:?dump file required}"
target="${2:?target database URL required}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="${target%%\?*}" "$dump"
echo "restored $(basename "$dump")"
