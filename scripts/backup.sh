#!/usr/bin/env bash
# Usage: scripts/backup.sh [output-dir]. Dumps the database named by DATABASE_URL (read from
# backend/.env when not set) in pg_dump custom format, and copies the object-storage bucket
# when the AWS CLI is available. Prints only file names, never the connection string.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ] && [ -f "$here/backend/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$here/backend/.env" | head -1 | cut -d= -f2- | tr -d '"')"
fi
: "${DATABASE_URL:?DATABASE_URL is required}"
out="${1:-$here/backups}"
mkdir -p "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$out/db-$stamp.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="${DATABASE_URL%%\?*}" --file="$file"
echo "database: $file ($(du -h "$file" | cut -f1))"
if command -v aws >/dev/null 2>&1 && [ -n "${S3_BUCKET:-}" ]; then
  aws --endpoint-url "${S3_ENDPOINT:-http://localhost:9000}" s3 sync "s3://$S3_BUCKET" "$out/objects-$stamp" --only-show-errors
  echo "objects: $out/objects-$stamp"
fi
