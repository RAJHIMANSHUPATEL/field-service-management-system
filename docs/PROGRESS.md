# Progress

Read this file and `docs/stages/README.md` before starting any work. Never redo merged work.

## Environment on the box

- PostgreSQL 17 runs natively (`sudo service postgresql start`). The user is `postgres`, the local password is in `backend/.env`, and that file is never committed.
- Node 24 is in `/usr/local`. Playwright Chromium is installed for `e2e/`.
- Checks: `cd backend && npm run lint && npm run build && npm test`; `cd frontend && npm run lint && npm run build`; `cd backend && npm run db:migrate && npm run db:seed`, then `cd e2e && npx playwright test`.

## Log

| Phase | Feature merged | Develop commit | Next |
|---|---|---|---|
| 5 (slice) | feat/start-accepted-job (stage 5) | 759d9df | Phase 0 gaps |
| 0 | feat/phase0-foundations (stage 6) | see git log | Phase 1: AuditEvent on every mutation, permission checks |
