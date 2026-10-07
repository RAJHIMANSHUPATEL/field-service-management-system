# Security review (Phase 12)

Reviewed 2026-10-07 against the code on `feat/phase12-hardening`. Each item names where it is enforced
and which test covers it.

| Area | Control | Evidence |
|---|---|---|
| Input | Every body and query parsed by Zod at the controller edge; unknown fields dropped | `requestSchemas` map; validation tests per module |
| Tenancy | Every query carries `organizationId` from the token; other-org ids answer 404 | cross-org tests in each module suite |
| Roles | `requireRole` on every route; matrix in [permissions.md](./permissions.md); OpenAPI lists roles per route | permission tests, hardening route test |
| Passwords | bcrypt; reset and invite tokens stored hashed, single use, expiring | auth tests |
| Sessions | Short-lived access JWT; rotating refresh tokens with reuse detection; httpOnly SameSite cookie for web | auth tests |
| Brute force | `authLimiter` per IP+email, `apiLimiter` per IP, 429 with Retry-After | hardening tests |
| Replays | Idempotency keys scoped per user, request hash checked | hardening tests |
| Files | Uploads through presigned S3 URLs with content-type and size limits; keys are server-chosen | attachment tests |
| Headers | helmet defaults (`helmet()`), CORS limited to `CORS_ORIGIN`, `trust proxy` only when `TRUST_PROXY` set | server.ts |
| Audit | State changes write audit events from middleware (ADR 0001) | audit tests |
| Secrets | Read from env only; `.env` git-ignored; nothing logged; `.env.example` has placeholders | repo review |
| Errors | 5xx bodies are generic; stack traces only in server logs | error handler tests |
| Data loss | `scripts/backup.sh` / `restore.sh`; drill in `scripts/restore-drill.sh` | drill log below |

## Known gaps (accepted for now)
- No MFA and no account lockout beyond rate limiting.
- Notifications are sent through file/log providers only; no real SMS or email provider is configured.
- No production deployment exists, so TLS, WAF and secret rotation are deployment concerns, see [deployment.md](./deployment.md).
- `npm audit --omit=dev` reports 4 high findings (`deepmerge-ts`, `mysql2`) that come in through Prisma 7's tooling packages; the only fix offered is a forced breaking downgrade. The API uses the Postgres adapter, so the MySQL driver is never loaded. Revisit on the next Prisma release.

## Backup and restore drill
`scripts/restore-drill.sh` dumps the live database, restores into a scratch database and compares
row counts for every table. Run on 2026-10-07: 43 tables, row counts identical, about 1 s.
