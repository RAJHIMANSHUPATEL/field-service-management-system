# Stage 18 — Hardening and mobile readiness (Phase 12)

**Status:** Complete. Deployment is documented for local use only and was not performed.

## Delivered
- **API documentation** generated from the routers: `GET /api/v1/openapi.json`, [openapi.json](../openapi.json), [api-reference.md](../api-reference.md), conventions in [api.md](../api.md). A test fails if any route is undocumented.
- **Idempotency keys** on POSTs (ADR [0006](../decisions/0006-idempotency-and-sync.md)).
- **Rate limiting**: auth and API limiters, Redis-backed, `429 RATE_LIMITED` with `Retry-After`.
- **Mobile auth**: `X-Client: mobile` returns the refresh token in the body; refresh and logout accept it.
- **Delta sync**: `GET /sync/technician?since=` with cursor and `hasMore`.
- **Performance**: composite indexes for work-order, visit and technician-schedule lists; invoice list paginated.
- **Security review**: [security.md](../security.md).
- **Backup and restore**: scripts plus a drill comparing row counts across all 43 tables.
- **Deployment**: [deployment.md](../deployment.md) — local only.

## Tests
`src/docs/hardening.test.ts` covers the docs, idempotency replay and reuse, rate limits, mobile
tokens, sync and pagination. The lifecycle e2e reads pending invoices through `meta.total`.
