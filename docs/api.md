# API conventions (v1)

Base path `/api/v1`. The machine-readable contract is generated from the routers themselves:
`GET /api/v1/openapi.json` (live) and [openapi.json](./openapi.json) (checked in, `npm run docs:api`).
The endpoint table is in [api-reference.md](./api-reference.md). A test fails when a route exists
in code but not in the document, so the two cannot drift.

## Responses and errors
- Success: `{ "data": ... }`; lists add `"meta": { "page", "limit", "total" }`.
- Error: `{ "error": { "code", "message", "details?" } }`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query failed its Zod schema (`details` lists the fields) |
| 401 | `UNAUTHENTICATED` | Missing or expired access token — refresh and retry |
| 403 | `FORBIDDEN` | Signed in, wrong role |
| 404 | `NOT_FOUND` | Missing **or in another organization** (never revealed) |
| 409 | `INVALID_TRANSITION` | State change not allowed from the current status |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Same key still running; retry shortly |
| 409 | `ORG_GST_STATE_REQUIRED` | An invoice cannot be priced (job completion, draft edit, issue) until an admin sets the organisation's GST state |
| 422 | `SITE_STATE_UNRECOGNISED` | The job site address's state is not an Indian state or UT; `details` has `addressId` and `state` |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key with a different body |
| 429 | `RATE_LIMITED` | Honour `Retry-After` (seconds) |

## Pagination
`?page=1&limit=20` (limit max 100) on list endpoints, newest first. Filters are query parameters
(for example `/invoices?status=ISSUED`). Use `meta.total` for counts rather than counting a page.

## State changes
Each transition is its own `POST` (for example `/work-orders/:id/visits/:visitId/start`). Read the
current state, POST the action, and treat `409 INVALID_TRANSITION` as "someone else moved it — reload".

## Idempotency (offline retries)
Send `Idempotency-Key: <uuid>` on any POST. The first response (2xx or 4xx) is stored for 24 hours
per user; a retry with the same key and body gets the same status and body plus
`Idempotent-Replayed: true`, without running the action again. 5xx responses are not stored, so
they can be retried with the same key. Generate one key per user intent and keep it with the
queued request until it succeeds.

## Mobile authentication
Browsers use the httpOnly refresh cookie. Native clients send `X-Client: mobile` on
`/auth/login` and `/auth/refresh`; the response then also includes `data.refreshToken`. Store it in
secure storage (Keychain / Keystore) and send `{ "refreshToken" }` in the body of `/auth/refresh`
and `/auth/logout`. Refresh tokens rotate on every refresh; reuse of an old one revokes the family, except that a retry within 10 s of the rotation (a lost response) gets the same new token back. See [security.md](./security.md#refresh-token-reuse-and-the-grace-window-decided-2026-10-08).
Access tokens are short-lived bearer tokens (`Authorization: Bearer`).

## Technician delta sync
`GET /sync/technician?since=<ISO time>` returns the technician's work orders (with visits, parts,
report state) changed after `since`, oldest change first: `{ serverTime, hasMore, full, workOrders }`.
Omit `since` for the first full sync. Store `serverTime` and send it as the next `since`; while
`hasMore` is true, call again immediately. Write actions go through the normal POST endpoints with
idempotency keys.

## Rate limits
Sign-in, refresh and password reset: `RATE_LIMIT_AUTH` per minute per IP and email (default 10).
Everything else: `RATE_LIMIT_API` per minute per IP (default 600). Counters live in Redis.
