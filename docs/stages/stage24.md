# Stage 24 — Online pay hidden while the provider is the mock

**Status:** Complete.

## Goal
`lib/payments.ts` only has a mock provider, which approves every charge. Customers should not see a
Pay button that "succeeds" without moving money. Online pay is offered only when a real provider is
configured. Office payments are unchanged. Decision record: ADR
[0004](../decisions/0004-billing-coverage-and-tax.md), section "Customer online pay while the provider
is the mock".

## Delivered
- **What counts as a real provider:** `onlinePayEnabled()` in `lib/payments.ts` is true only when
  `PAYMENT_PROVIDER` is in the allowlist `REAL_PAYMENT_PROVIDERS = ["razorpay", "stripe"]` (trimmed,
  case-insensitive).
  - Unset, empty, `mock` and unknown names (typos) keep online pay off.
  - Neither gateway is implemented. With one of those names, Pay is offered, but `charge()` still
    answers `503 PAYMENT_PROVIDER_UNAVAILABLE` until its branch is written.
  - `charge()` is unchanged: the mock still approves every charge.
- **`GET /api/v1/invoices/payment-options`**
  - Answers `{ data: { onlinePay } }` to admin, ops and customers. Technicians get `403`, anonymous
    callers `401`.
  - The answer is parsed with the Zod `paymentOptionsSchema`.
  - The route is declared before `/:id`, so `payment-options` is never taken as an invoice id.
  - OpenAPI documents the `data` schema.
- **`POST /api/v1/invoices/:id/pay`** is enforced on the server, in this order:
  1. The invoice is visible to the caller. Another organisation or a draft gets `404`; another
     customer's contact, office staff and technicians get `403`.
  2. Online pay is on. Otherwise the answer is **`503 PAYMENT_PROVIDER_UNAVAILABLE`** ("Online payment
     is not available; please pay the office directly"). This is the same code the provider uses, so
     clients handle one code, and the access checks come first so a 503 never confirms that another
     organisation's invoice exists.
  3. The invoice is payable (`409 INVALID_TRANSITION`).

  OpenAPI lists `201` and `503` for this route.
- **Customer invoice page:**
  - Reads payment options with TanStack Query (`usePaymentOptions`, customers only, validated with
    Zod).
  - Shows **Pay** only when `onlinePay` is true.
  - Otherwise shows "Pay ₹… to the office by cash, UPI, card or bank transfer."
  - The admin and ops Record payment form is unchanged.
- **Demo seed:**
  - It replays history in which a few customers paid online, so it calls `allowMockOnlinePay(true)`
    in its own process.
  - Those payments still go through `POST /invoices/:id/pay` (audit middleware, notifications, the
    same simulated-clock reads).
  - No environment variable or request can turn the switch on.
  - Checked against `DEMO_ANCHOR=2026-10-08` (develop vs this branch):
    - The replay trace is identical: every action, its time and the RNG state.
    - The printed counts are the same, and so are the payments.
    - The only differences, which also appear between two runs of develop, come from steps that
      read the real clock (the final overdue sweep and "read" notifications older than two days).
- **Lifecycle e2e:**
  - The customer now checks `payment-options` (`onlinePay: false`), sees no Pay button and sees the
    pay-the-office hint.
  - Ops records the ₹1,711 by UPI, and the rest of the run (credit, refund, receipts) is unchanged.

## Tests
`billing.test.ts` → "customer online pay":
- reports onlinePay false while the provider is the mock or unset, to customers and the office
- reports onlinePay true when a real provider is configured, whose missing gateway still answers 503
- answers POST /pay with 503 while online pay is off, after the access checks, and the office still records payments
- keeps the mock charge approving every charge, used by the demo replay (the lib-level `charge()` and
  the service path through the in-process switch)

"charges only the uncovered amount on a contract-covered job…" now expects `503` from `/pay` and pays
through the office (UPI) instead.

## Screenshots
`/workspace/screens/online-pay/`:
- `customer-invoice-mock.png`: no Pay button (mock provider).
- `customer-invoice-real-provider.png`: Pay shown with `PAYMENT_PROVIDER=razorpay` (clicking it would
  answer 503, as no gateway exists).
- `ops-invoice-record-payment.png`: the office form, unchanged.

## Not done
No Razorpay or Stripe integration. Webhooks, payment links and refunds through a gateway are out of
scope.
