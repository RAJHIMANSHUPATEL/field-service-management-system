# Security review (Phase 12)

Reviewed 2026-10-07 against the code on `feat/phase12-hardening`. Each item names where it is enforced
and which test covers it.

| Area | Control | Evidence |
|---|---|---|
| Input | Every body and query parsed by Zod at the controller edge; unknown fields dropped | `requestSchemas` map; validation tests per module |
| Tenancy | Every query carries `organizationId` from the token; other-org ids answer 404 | cross-org tests in each module suite |
| Roles | `requireRole` on every route; matrix in [permissions.md](./permissions.md); OpenAPI lists roles per route | permission tests, hardening route test |
| Passwords | argon2; reset and invite tokens stored hashed, single use, expiring | auth tests |
| Sessions | Short-lived access JWT; rotating refresh tokens with reuse detection and a 10 s retry grace window (below); httpOnly SameSite cookie for web | auth tests |
| Brute force | `authLimiter` per IP+email, `apiLimiter` per IP, 429 with Retry-After | hardening tests |
| Replays | Idempotency keys scoped per user, request hash checked | hardening tests |
| Files | Uploads through presigned S3 URLs with content-type and size limits; keys are server-chosen | attachment tests |
| Headers | helmet defaults (`helmet()`), CORS limited to `CORS_ORIGIN`, `trust proxy` only when `TRUST_PROXY` set | server.ts |
| Audit | State changes write audit events from middleware (ADR 0001) | audit tests |
| Secrets | Read from env only; `.env` git-ignored; nothing logged; `.env.example` has placeholders | repo review |
| Errors | 5xx bodies are generic; stack traces only in server logs | error handler tests |
| Data loss | `scripts/backup.sh` / `restore.sh`; drill in `scripts/restore-drill.sh` | drill log below |

## Refresh-token reuse and the grace window (decided 2026-10-08)

Refresh tokens rotate on every `POST /auth/refresh`, and presenting an already-used token revokes
the whole family (`401 REFRESH_TOKEN_REUSED`). On its own that rule signed users out whenever a
refresh response was lost: if the page reloads while the refresh is in flight, the browser never
stores the new cookie and its retry with the old one looked like theft. CI hit this in e2e.

**Decision:** a rotated token gets a grace window of `REFRESH_GRACE_WINDOW_MS` (10 s; env override
from 0, which turns it off, to 60 000). Inside the window, presenting the just-rotated token again
returns the **same successor** refresh token the first refresh issued (same family, same session),
with a fresh access token for the same user. Access tokens are not stored, so a new one is signed;
its 15-minute lifetime is unchanged. Cookie and mobile (`X-Client: mobile`, token in the body)
refreshes behave the same.

What stays reuse (family revoked, `401 REFRESH_TOKEN_REUSED`, no token returned):
- any presentation of a rotated token at or after the end of its window;
- a retry inside the window when the successor is no longer live: already rotated in turn,
  logged out, revoked with its family or by a password reset, or expired. Handing back a dead or
  newer token would either fail anyway or extend a session the client has already moved past, so
  this follows the existing rule for presenting a revoked token;
- a token revoked by logout or a password reset (it never had a window).

**What is stored and how it is protected.** On rotation the old row gets `graceUntil`,
`successorId` and `successorSecret`. Refresh tokens are otherwise stored only as SHA-256 hashes, so
the successor is never stored in plaintext: `successorSecret` is the raw successor sealed with
AES-256-GCM (random 96-bit IV, auth tag) under a key derived with HKDF-SHA256 from
`JWT_REFRESH_SECRET`, with the old row's id as associated data so the value cannot be replayed onto
another row. Before handing it back the server checks that it opens, that its hash matches the
successor row, and that the successor is live. The sealed value is ignored once `graceUntil` has
passed, wiped from the family's earlier rows at the next rotation, and wiped from every row of a
family when the family is revoked. Database read access alone does not yield a usable token.

**Concurrency.** Rotation is one transaction: create the successor, then revoke the old token with
a conditional update (`revokedAt IS NULL`). Concurrent refreshes of the same token queue on the row
lock; the loser rolls back its own successor, re-reads the token and is answered from the window,
so all of them receive the one successor.

Tests in `src/modules/auth/auth.test.ts` ("refresh grace window") cover the retry by cookie and by
body, the last millisecond of the window and the first one after it, a successor that was rotated
or logged out, a forced concurrent race, and the sealed storage. Time is controlled with fake
`Date`, not sleeps. The e2e `session-refresh.spec.ts` drops a real refresh response in the browser, reloads, and checks the user stays signed in (it fails with `REFRESH_GRACE_WINDOW_MS=0`).

## Known gaps (accepted for now)
- No MFA and no account lockout beyond rate limiting.
- Notifications are sent through file/log providers only; no real SMS or email provider is configured.
- No production deployment exists, so TLS, WAF and secret rotation are deployment concerns, see [deployment.md](./deployment.md).
- `npm audit --omit=dev` reports 4 high findings (`deepmerge-ts`, `mysql2`) that come in through Prisma 7's tooling packages; the only fix offered is a forced breaking downgrade. The API uses the Postgres adapter, so the MySQL driver is never loaded. Revisit on the next Prisma release.

## Backup and restore drill
`scripts/restore-drill.sh` dumps the live database, restores into a scratch database and compares
row counts for every table. Run on 2026-10-07: 43 tables, row counts identical, about 1 s.
