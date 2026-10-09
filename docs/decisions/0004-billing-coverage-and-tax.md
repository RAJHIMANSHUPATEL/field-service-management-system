# 0004 — Who pays, and how tax is computed

Status: accepted (Phase 8); amended 2026-10-08 for inter-state supply (IGST), and again for credit notes and refunds

Coverage is decided when the invoice is priced, from the job's completion date: warranty on the asset first (fully covered), else the active service contract covering the asset (per-category percentages), else nothing. Coverage is stored per invoice line (`coveredAmount`), so the customer and office see exactly what was absorbed and by whom.

Tax applies after coverage and discount, at the organisation's rate (`taxRatePercent`). Lines carry an optional SAC code from the service type.

## Intra- and inter-state supply

The place of supply is the job site: the work order's address. The supplier's state is the
organisation's GST registration state (`Organization.gstState`, a two-digit GST state code such as
`29` Karnataka, `27` Maharashtra, `36` Telangana).

- **Same state (intra-state):** equal CGST and SGST halves, IGST stored as 0.
- **Different state (inter-state):** the full tax is stored as IGST, CGST and SGST are 0.

The amount of tax does not depend on the supply type. It is always computed as before: half the
rate on the taxable amount, rounded to the paisa (half up), twice. IGST is that sum, so it equals
CGST + SGST exactly and switching supply type never changes the tax total or the invoice total
(18% of ₹1.03 rounded once would be ₹0.19; the two halves give ₹0.18, and IGST is ₹0.18). Rate,
coverage and discount are unaffected. `Invoice.igst` was added with default 0, so invoices priced
before this change keep their CGST and SGST and read as intra-state.

**Normalising states.** `Address.state` is free text, so both sides go through one lookup of the 36
states and union territories plus "Other Territory" (`backend/src/lib/gstStates.ts`). It accepts the
two-digit code (a single digit is padded), the usual abbreviation (with common alternates: TS/TG,
OD/OR, CG/CT) or the name, case-insensitively, with `&` read as "and" and punctuation ignored
("Jammu & Kashmir", "orissa", "Pondicherry"). Daman and Diu (old code 25) and Dadra and Nagar Haveli
resolve to the merged code 26. The organisation stores the code; the API's Zod schema rejects a
value that does not resolve (400 `VALIDATION_ERROR`).

**Missing or unknown states are refused, not guessed.** A wrong split is a compliance error that
cannot be fixed by editing a draft later, so pricing stops instead:
- no organisation GST state → `409 ORG_GST_STATE_REQUIRED` (a precondition on the organisation, like
  other 409s). The column is nullable so existing and newly registered organisations can exist
  without it; an admin sets it under Master data → Company (`PATCH /api/v1/organization`).
- a site state that does not resolve → `422 SITE_STATE_UNRECOGNISED` with `addressId` and `state` in
  `details`; the office corrects the customer address.

Pricing happens when a visit completes (the draft is written in the completion transaction), when
ops edit a draft, and at issue. So until the GST state is set, a technician's completion is refused
too and the visit stays in progress; nothing is lost and the same request succeeds once corrected.
Blocking completion was preferred over writing a draft with a guessed split or none at all.

## Drafts reprice; issued invoices are frozen

Drafts are priced from source data whenever they are written: at completion, on every edit (discount,
notes, extra lines) and — added with this amendment — one last time when ops issue them, inside the
issue transaction. Before this, issue used the stored draft totals, so a site address corrected after
completion (a different state) would only be picked up if someone happened to edit the draft. Reading
a draft does not reprice it; the issued invoice is what counts. From `ISSUED` on (paid, overdue, void)
an invoice is never repriced: edits and re-issue answer 409, and address, contract or warranty changes
do not touch it.

## Credit notes and refunds

An issued invoice is never repriced, so a correction after issue is a separate record, never an edit
of the lines or the total:

- **Credit note** (`POST /invoices/:id/credit-notes`, `{ amount, reason }`): lowers what the customer
  owes. Numbered per organisation `CN-<year>-<00001>` (its own counter, like invoice numbers).
- **Refund** (`POST /invoices/:id/refunds`, `{ amount, reason }`): records money paid back to the
  customer. Numbered `RF-<year>-<00001>`. Payments are never deleted or changed. A refund is against
  the invoice's payments as a whole (it does not name one payment) and moves no money: there is no
  payment gateway, so the office pays the money back outside the app and records it here.

**Statuses.** Both are allowed on `ISSUED`, `OVERDUE` and `PAID` invoices. The product spec also
names PARTIALLY_PAID, but the app has no such status: a partly paid invoice is `ISSUED` or `OVERDUE`
with payments, so it is covered. `DRAFT` (adjust the draft instead) and `VOID` answer
`409 INVALID_TRANSITION`. A void invoice never has payments, so it has nothing to refund. Void stays
limited to invoices with no payments, and is now also refused once a credit note exists: a void
invoice with live credit notes against it would be ambiguous.

**One balance definition** (`backend/src/modules/invoices/invoice.balance.ts`). The invoice stores
running totals next to `total`: `amountPaid` (payments), `creditedTotal` and `refundedTotal`.

    owed = (total − credits) − (payments − refunds)
    balance    = owed if owed > 0, else 0     what the customer still has to pay
    refund due = −owed if owed < 0, else 0    what the office owes back
    creditable = total − credits              (issued, overdue or paid invoices; else 0)
    refundable = payments − refunds           (issued, overdue or paid invoices; else 0)

A void invoice owes nothing (balance 0). The API returns these as `settlement` on every invoice. The
invoice page, the PDF, payment limits, online payment, the overdue sweep (in SQL) and the dashboard's
outstanding figure all use this definition. This also fixed an earlier mismatch: a void invoice showed
balance 0 in the PDF but the full total on the page. Both now show 0.

**Limits** are checked under a row lock (`SELECT … FOR UPDATE` on the invoice, in the same transaction
that writes the record, the running total and the status). Concurrent credits, refunds and payments on
one invoice therefore run one after another, and none can pass a limit. CHECK constraints back this up
in the database (positive amounts, `0 ≤ creditedTotal ≤ total`, `0 ≤ refundedTotal ≤ amountPaid`).
- A credit above `creditable` → `409 CREDIT_EXCEEDS_REMAINING` (`details.creditable`).
- A refund above `refundable`, including any refund when nothing has been paid →
  `409 REFUND_EXCEEDS_PAID` (`details.refundable`).
- Zero, negative, non-numeric or 3-decimal amounts, or a missing reason → `400 VALIDATION_ERROR`.
- Only admin and ops can create them (customers and technicians `403`). Another organisation's invoice
  is `404`. Customers see both lists on their invoice. Each one writes an AuditEvent
  (`invoices.credit-notes` / `invoices.refunds`, entity = the invoice).

**Status effects.**
- A credit that brings `owed` to zero or below marks an `ISSUED`/`OVERDUE` invoice `PAID` (`paidAt`
  set). Nothing is left to collect.
- Credits are capped by the total, not by the balance. Crediting an invoice that is already paid is
  allowed and leaves a **refund due** (negative owed). The invoice stays `PAID`, and the page, the PDF
  and the dashboard show the refund due until a refund records it. Capping credits at the balance was
  rejected because then a paid invoice could never be credited.
- A refund that makes `owed` positive again (more refunded than was owed back, for example a reversed
  bank transfer) sends a `PAID` invoice back to `ISSUED`, or to `OVERDUE` if its due date has passed,
  and clears `paidAt`. The office can then collect the balance as usual.
- The overdue sweep only marks invoices that still owe something.

Out of scope: the customer's GSTIN, reverse charge, a payment gateway for refunds, and refunds tied to
a single payment.

## Customer online pay while the provider is the mock (stage 24)

**Context.** `lib/payments.ts` has only a mock provider that approves every charge. Showing customers a
Pay button that "succeeds" without moving money is misleading outside a demo.

**Decision.**
- Online pay is on only when `PAYMENT_PROVIDER` names a real provider: an allowlist,
  `REAL_PAYMENT_PROVIDERS = ["razorpay", "stripe"]` (trimmed, case-insensitive). Unset, empty, `mock`
  and unknown names (typos) keep it off. Neither gateway is implemented, so with one of those names Pay
  is offered but `charge()` still answers `503 PAYMENT_PROVIDER_UNAVAILABLE` until its branch is written.
  An allowlist was chosen over "any name other than mock" so a typo never turns on a Pay button.
- `GET /invoices/payment-options` returns `{ onlinePay }` (admin, ops, customers). The customer invoice
  page shows Pay only when it is true, and otherwise tells the customer to pay the office.
- `POST /invoices/:id/pay` enforces it on the server: after the access checks (404 / 403, so the
  answer never reveals another organisation's invoice) and before the status check, it answers
  `503 PAYMENT_PROVIDER_UNAVAILABLE`, the same code the provider uses, so clients handle one code.
- `charge()` is unchanged: the mock still approves every charge.
- The demo seed replays history that includes online payments. It calls `allowMockOnlinePay(true)` in
  its own process, and its payments keep going through the HTTP route (audit, notifications, the same
  clock reads), so the dataset is identical. The switch is in-process only: no environment variable or
  request can turn it on. Rejected alternatives: calling the service from the seed (skips the audit
  middleware and changes the replay), or an env flag (could be left on in production).
- Office payments (cash, UPI, card, bank transfer) are unchanged.

