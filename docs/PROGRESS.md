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
| 5 | feat/phase5-execution (stage 11) | 0c41a3b | Phase 6: parts and inventory (stock by location, transfers, reservation, consumption, ledger) |
| 6 | feat/phase6-inventory (stage 12) | d679dd3 | Phase 7: incomplete jobs, AWAITING_PARTS / FOLLOW_UP_REQUIRED, part requests, visit two |
| 7 | feat/phase7-follow-up (stage 13) | 0b91785 | Phase 8: service report PDF, invoice with coverage and tax, payment, overdue |
| 8 | feat/phase8-billing (stage 14) | 4a41697 | Phase 9: feedback and notifications (BullMQ on Redis, mocked channels) |
| 9 | feat/phase9-feedback-notifications (stage 15) | 56b719a | Phase 10: contract visits and preventive maintenance plans |
| 10 | feat/phase10-maintenance (stage 16) | e7bb153 | Phase 11: operations dashboard and technician performance |
| 11 | feat/phase11-analytics (stage 17) | 8f44487 | Phase 12: hardening, API docs, rate limits, idempotency, backup drill |
| 12 | feat/phase12-hardening (stage 18; deployment documented locally only, not deployed) | 1bd807e | All phases merged. User-only: push feat/phase0-ci with a workflow-scoped token. Strict checks: /workspace/check-strict.sh |
| 0 (CI) | feat/phase0-ci-workflow (stage 6: GitHub Actions mirrors check-strict.sh) | 42327e8 | All phases 0-12 complete. Strict checks: /workspace/check-strict.sh |
| Demo | feat/demo-seed + fix/invoice-breadcrumb (stage 19: deterministic Indian demo seed, npm run db:seed:demo; docs/demo.md) | e894ed9 | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Auth | fix/refresh-grace-window (10 s refresh grace window, sealed successor; decision in docs/security.md) | c216139 | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Billing | feat/billing-igst (stage 20: IGST for inter-state supply, org GST state; ADR 0004 amended) | ab7eb2a | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Billing | feat/invoice-pdf (stage 21: downloadable invoice PDF, GET /invoices/:id/pdf, 409 INVOICE_NOT_ISSUED) | d4a9e17 | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Billing | feat/invoice-credits-refunds (stage 22: credit notes and refunds, one balance definition; ADR 0004 amended) | 7e74ccc | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Mailer | feat/mailer-smtp (stage 23: SMTP email provider via nodemailer) | 7a0b4a3 | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
| Billing | feat/online-pay-gate (stage 24: customer online pay hidden while the provider is the mock; GET /invoices/payment-options; ADR 0004 amended) | 49089d7 | All phases 0-12 complete; demo dataset available. Strict checks: /workspace/check-strict.sh |
