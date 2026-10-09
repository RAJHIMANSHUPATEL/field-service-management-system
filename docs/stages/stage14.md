# Stage 14 — Service report, invoice, payment

Completes Phase 8.

## Decisions

- **Service report.** `GET /work-orders/:id/report` returns a PDF built with pdfkit from the visit data each time it is requested: job, visits, times, diagnosis, work performed, outcome reasons, parts used, the signature image and notes.
  - It is available once the work order is `COMPLETED`; before that it returns `409 REPORT_NOT_READY`.
  - Readers are org staff, the assigned technician, and the job's customer.
- **Pricing inputs.** Each service type has a `serviceCharge`, a `labourRatePerHour` and an optional `sacCode`.
  - Labour is billed per job in half hours, rounded up, with at least half an hour. The time is summed over visits from start to completion or end.
  - Parts are the `CONSUMED` visit parts, at the price recorded when they were added.
  - The organisation holds `taxRatePercent` (default 18) and `paymentTermsDays` (default 15).
- **Invoice.** Completing the job creates a `DRAFT` invoice in the same transaction, so the system prepares it and ops reviews it.
  - The arithmetic lives in `invoices/invoice.pricing.ts` and is unit-tested against the requirements example (500 + 850 + 500, 18% tax, total 2,183).
  - Order: lines, then coverage per line, then the discount (it may not exceed the billable amount), then tax on what remains.
  - Tax is split equally into CGST and SGST (intra-state supply).
  - Money is `Decimal(12,2)` with a currency code, rounded half-up.
- **Coverage, who pays (README §4.2).** It is evaluated from the completion date whenever the draft is priced.
  - If the asset is under warranty (`warrantyExpiresAt` ≥ completion), every line is covered at 100%.
  - Otherwise, the active `ServiceContract` that covers the asset applies its percentages for service charge, labour and parts.
  - If neither applies, the customer pays the full amount.
  - See [ADR 0004](../decisions/0004-billing-coverage-and-tax.md).
- **Invoice states** (`invoices/invoice.transitions.ts`): `DRAFT → ISSUED → PAID`, `ISSUED → OVERDUE → PAID`, and `DRAFT | ISSUED | OVERDUE → VOID` (only with no payments, and a reason is required).
  - Issuing assigns `INV-<year>-<sequence>` per organisation and the due date.
  - A zero-total invoice (fully covered) goes straight to `PAID`.
  - Draft edits (`PATCH` discount or notes, `POST /lines` for additional charges) reprice from the source data.
  - Anything illegal returns `409 INVALID_TRANSITION`.
- **Payments.** `POST /invoices/:id/payments` (office: cash, UPI, card, bank transfer) accepts part payments.
  - A payment above the balance returns `409 PAYMENT_EXCEEDS_BALANCE` with the balance.
  - The invoice becomes `PAID` when the balance reaches zero.
  - The customer pays the balance with `POST /invoices/:id/pay` through `lib/payments.ts`. Only the local `mock` provider exists; set `PAYMENT_PROVIDER` and implement `charge()` to switch to a real gateway. (Stage 24 hides customer online pay while the provider is the mock; see [stage24.md](./stage24.md).)
- **Overdue.** `ISSUED` invoices past their due date become `OVERDUE` before every invoice read, on an hourly timer in the API process, and on `POST /invoices/mark-overdue`.
- **Visibility.** Customers see their own invoices, but never drafts. Technicians do not see invoices.
- **Contracts.** `ServiceContract` and `ContractAsset` with create, list, get and cancel at `/contracts` (minimal, so coverage can be tested). Phase 10 extends it with preventive maintenance.

## Completed

- Migration `add_contracts_invoices_and_payments`.
- Modules: invoices (pricing, transitions, service, routes), contracts, the work order report, and the mock payments library.
- Tests in `invoices/billing.test.ts`:
  - arithmetic and the example, coverage choice, half-hour labour
  - draft → issue → part payment → overpay rejected → paid
  - contract-covered and warranty jobs, overdue detection and payment, void rules
  - roles and orgs, and the report PDF and its access
- Web:
  - `/invoices` list and detail (lines with SAC, coverage, CGST/SGST, payments).
  - Draft charge and discount, issue, record payment, void.
  - The customer Pay button; Service report buttons; service type prices.
- e2e:
  - The lifecycle now runs through invoice and pay: water heater out of warranty, 500 + 500 + 450 + 261 = ₹1,711, the customer pays online. (Since stage 24 the office records the payment, as online pay is off with the mock.)
  - `billing.spec.ts`: a job on an AMC-covered unit invoices only what is not covered (₹0 here, so it is issued as paid).
- The seed adds demo prices and an out-of-warranty water heater.

## Left for later stages

IGST and place of supply, credit notes and refunds, invoice PDF, payment reminders (Phase 9).
