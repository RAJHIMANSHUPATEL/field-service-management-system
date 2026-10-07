# Deployment — local only

> **Status: documented for local use only. Not deployed.** By instruction, nothing is deployed to any
> hosted environment and no external accounts are used. This page describes how to run the system
> as a production-like stack on one machine and what a real deployment would still need.

## Run locally (production build)
1. Start PostgreSQL, Redis and S3-compatible storage (`docker compose up -d`, or the local services script).
2. `cp backend/.env.example backend/.env` and set secrets (`JWT_SECRET`, `DATABASE_URL`, ...).
3. Backend: `cd backend && npm ci && npx prisma migrate deploy --config prisma7.config.ts && npm run build && NODE_ENV=production node dist/server.js`.
4. Worker (notifications): `NOTIFICATION_QUEUE=bullmq` and run the worker entry alongside the API.
5. Frontend: `cd frontend && npm ci && npm run build` and serve `dist/` behind the same origin, proxying `/api` to the backend.
6. Behind a reverse proxy set `TRUST_PROXY=1` so rate limits see client addresses.

## Operations
- Health: `GET /api/v1/health`. Docs: `GET /api/v1/openapi.json`.
- Backups: `scripts/backup.sh [dir]` (pg_dump custom format, plus bucket copy when configured).
  Restore with `scripts/restore.sh <dump> <empty-db-url>`; rehearse with `scripts/restore-drill.sh`.
- Migrations are forward-only; never edit a merged migration.

## Not done (needs a hosting decision)
TLS termination, managed Postgres/Redis, secret manager, log shipping, uptime alerts, CDN for the
frontend, and scheduled backups to off-site storage.
