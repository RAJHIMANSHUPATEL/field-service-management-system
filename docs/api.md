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
| 409 | `CREDIT_EXCEEDS_REMAINING` | `POST /invoices/:id/credit-notes` above what is left of the total after earlier credits; `details.creditable` |
| 409 | `REFUND_EXCEEDS_PAID` | `POST /invoices/:id/refunds` above payments minus earlier refunds (any refund when nothing is paid); `details.refundable` |
| 409 | `INVOICE_NOT_ISSUED` | `GET /invoices/:id/pdf` on a draft: the PDF exists once the invoice is issued (customers get `404`, as drafts are hidden from them) |
| 503 | `PAYMENT_PROVIDER_UNAVAILABLE` | `POST /invoices/:id/pay` while customer online pay is off (the provider is the mock or unset), or when the configured provider has no gateway yet. Comes after the access checks (404 / 403) and before the status check (409) |
| 409 | `ORG_GST_STATE_REQUIRED` | An invoice cannot be priced (job completion, draft edit, issue) until an admin sets the organisation's GST state |
| 422 | `SITE_STATE_UNRECOGNISED` | The job site address's state is not an Indian state or UT; `details` has `addressId` and `state` |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key with a different body |
| 429 | `RATE_LIMITED` | Honour `Retry-After` (seconds) |

## Customer online pay
`GET /invoices/payment-options` (admin, ops and customers; technicians `403`) answers
`{ "data": { "onlinePay": false } }` while `PAYMENT_PROVIDER` is unset, empty, `mock` or an unknown
name, and `{ "data": { "onlinePay": true } }` when it names a real provider (`razorpay` or `stripe`,
case-insensitive). The customer invoice page shows **Pay** only when `onlinePay` is true.
`POST /invoices/:id/pay` (customers) checks, in order: the invoice is visible to the caller (another
organisation or a draft `404`, another customer's contact `403`), online pay is on (else
`503 PAYMENT_PROVIDER_UNAVAILABLE`), and the invoice is payable (`409 INVALID_TRANSITION`). No gateway is
implemented yet, so with `razorpay` or `stripe` the charge itself still answers `503` with the same code.
Office payments (`POST /invoices/:id/payments`: cash, UPI, card, bank transfer) are unaffected.

## Invoice balance, credit notes and refunds
Every invoice response carries `settlement`: `netTotal` (total − credits), `netPaid` (payments −
refunds), `balance` (still to pay), `refundDue` (owed back to the customer), `creditable` and
`refundable`, as two-decimal strings. `owed = (total − credits) − (payments − refunds)`. The balance
is `owed` when positive and the refund due is `−owed` when negative. A void invoice owes nothing.
`POST /invoices/:id/credit-notes` and `POST /invoices/:id/refunds` take `{ "amount": "250.00",
"reason": "..." }` (admin and ops, on `ISSUED`, `OVERDUE` or `PAID` invoices). Each answers `201` with the
updated invoice, including `creditNotes` / `refunds` (`CN-2026-00001`, `RF-2026-00001`). A draft or
void invoice is `409 INVALID_TRANSITION`. See ADR 0004 for the status effects.

## PDF downloads
`GET /work-orders/:id/report` (service report) and `GET /invoices/:id/pdf` (invoice) answer
`200 application/pdf` with `Content-Disposition: inline; filename="..."` instead of JSON; errors are
still JSON. The invoice PDF is built from the stored invoice (never repriced) for `ISSUED`,
`OVERDUE`, `PAID` and `VOID`; "partially paid" is `ISSUED` or `OVERDUE` with payments. Amounts print
as `INR 2,183.00` (the built-in PDF fonts have no rupee sign). Downloads are reads, so they are not audited.

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
