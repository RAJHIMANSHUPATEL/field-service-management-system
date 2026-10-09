# Deployment — local only

> **Status: documented for local use only. Not deployed.** By instruction, nothing is deployed to any
> hosted environment and no external accounts are used. This page describes how to run the system
> as a production-like stack on one machine and what a real deployment would still need.

## Run locally (production build)
1. Start PostgreSQL, Redis and S3-compatible storage (`docker compose up -d`, or the local services script).
2. `cp backend/.env.example backend/.env` and set secrets (`JWT_SECRET`, `DATABASE_URL`, ...).
3. Backend: `cd backend && npm ci && npx prisma migrate deploy --config prisma7.config.ts && npm run build && NODE_ENV=production npm start`.
4. Notifications: with `NOTIFICATION_QUEUE=bullmq` (default outside tests) the BullMQ worker starts inside the API process and uses Redis.
5. Frontend: `cd frontend && npm ci && npm run build` and serve `dist/` behind the same origin, proxying `/api` to the backend.
6. Behind a reverse proxy set `TRUST_PROXY=1` so rate limits see client addresses.

## Email
Mail goes through `backend/src/lib/mailer.ts`; callers only call `sendMail`. `MAIL_PROVIDER` picks
the provider:
- `log` (default) prints each message; `file` also appends it to `MAIL_OUTBOX_FILE`. Nothing leaves
  the machine.
- `smtp` sends through any SMTP server with nodemailer. Set `SMTP_HOST`, `SMTP_PORT` (a number),
  `SMTP_USER` and `SMTP_PASS`; optionally `SMTP_SECURE` (`true`/`false`; the default is TLS from the
  start on port 465 and STARTTLS otherwise) and `MAIL_FROM` (default `FieldOps <no-reply@example.com>`).
  - If any of the four required variables is missing, messages are logged as with `log`, with one
    warning naming the missing variables (never their values), and nothing throws.
  - A failed send throws; the notification worker records `lastError` and retries (5 attempts, then
    `FAILED`, retryable from **Notifications → Deliveries**).

To switch: put the variables in `backend/.env` (or the secret manager), set `MAIL_PROVIDER=smtp` and
restart the API (the worker runs in the same process). Switch back by setting `MAIL_PROVIDER=log`.
Not used here: no SMTP account is configured or contacted by this project; tests use a fake transport.

## Operations
- Health: `GET /health`. Docs: `GET /api/v1/openapi.json`.
- Backups: `scripts/backup.sh [dir]` (pg_dump custom format, plus bucket copy when configured).
  Restore with `scripts/restore.sh <dump> <empty-db-url>`; rehearse with `scripts/restore-drill.sh`.
- Migrations are forward-only; never edit a merged migration.

## Not done (needs a hosting decision)
TLS termination, managed Postgres/Redis, secret manager, log shipping, uptime alerts, CDN for the
frontend, and scheduled backups to off-site storage.
