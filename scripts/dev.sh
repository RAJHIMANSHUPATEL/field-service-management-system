#!/usr/bin/env bash
# One command from a fresh clone to a working login page against a seeded database.
# Uses docker compose when available; otherwise expects Postgres (and Redis/MinIO when needed) running locally.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

if command -v docker >/dev/null 2>&1; then
  docker compose -f "$root/docker-compose.yml" up -d --wait
fi

cd "$root/backend"
[ -f .env ] || cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed

cd "$root/frontend"
npm ci

cd "$root"
(cd backend && npm run dev) &
(cd frontend && npm run dev) &
echo "Open http://localhost:5173 and sign in as admin@fieldservice.local / Password123!"
wait
