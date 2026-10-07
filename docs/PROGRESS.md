# Progress

Read this file and `docs/stages/README.md` before starting any work. Never redo merged work.

## Environment on the box

- PostgreSQL 17 runs natively (`sudo service postgresql start`). The user is `postgres`, the local password is in `backend/.env`, and that file is never committed.
- Redis runs natively (`sudo service redis-server start`).
- Object storage: the MinIO binary download is gone (HTTP 410), so the box runs the S3 emulator `moto_server` on :9000 from `/workspace/.venv-moto` (`/workspace/.venv-moto/bin/moto_server -H 0.0.0.0 -p 9000`). `docker-compose.yml` still uses the MinIO image for machines with Docker.
- Node 24 is in `/usr/local`. Playwright Chromium is installed for `e2e/`.
- Checks: `cd backend && npm run lint && npm run build && npm test`; `cd frontend && npm run lint && npm run build`; `cd backend && npm run db:migrate && npm run db:seed`, then `cd e2e && npx playwright test`.

## Log

| Phase | Feature merged | Develop commit | Next |
|---|---|---|---|
| 5 (slice) | feat/start-accepted-job (stage 5) | 759d9df | Phase 0 gaps |
| 0 | feat/phase0-foundations (stage 6) | fbf8fb3 | Phase 1 |
| 1 | feat/phase1-audit-and-access (stage 7) | 917e9fd | Phase 2 master data: skills, service areas, parts catalogue, warehouses, warranty |
| 2 | feat/phase2-master-data (stage 8) | 9cecf63 | Phase 3: request attachments, set priority/service type at triage |
| 3 | feat/phase3-request-attachments (stage 9) | a7cc563 | Phase 4: availability, calendar, scoring, reassignment, reschedule/cancel with history |
| 4 | feat/phase4-scheduling (stage 10) | 1c154a7 | Phase 5: technician execution (my jobs, diagnosis, work, photos, signature, completion) |
