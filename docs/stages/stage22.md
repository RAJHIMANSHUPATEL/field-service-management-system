# Stage 22 — Credit notes and refunds

**Status:** Complete.

## Goal
Stage 14 left out credit notes and refunds. This stage lets the office correct an issued invoice and
pay money back without editing what was issued or deleting payments. Decision record: ADR
[0004](../decisions/0004-billing-coverage-and-tax.md), section "Credit notes and refunds".

## Delivered
- **Data:** migration `add_credit_notes_and_refunds`.
  - `CreditNote` and `Refund` tables: cuid ids, `organizationId`, `invoiceId`, a per-organisation
    unique `number` (`CN-2026-00001`, `RF-2026-00001`), `Decimal(12,2)` amount, currency, reason,
    `createdById`, timestamps, and indexes on the invoice and on (organisation, createdAt).
  - Running totals `Invoice.creditedTotal` and `Invoice.refundedTotal`.
  - Counters `Organization.creditNoteSequence` and `refundSequence`.
  - CHECK constraints: positive amounts, credits within the total, refunds within payments.
- **API** (admin and ops):
  - `POST /api/v1/invoices/:id/credit-notes` and `POST /api/v1/invoices/:id/refunds`, both taking
    `{ amount, reason }` and answering `201` with the updated invoice.
  - The invoice lock, the new row, the running total and the status change all happen in one
    transaction under `SELECT ... FOR UPDATE`.
  - Errors:
    - `409 CREDIT_EXCEEDS_REMAINING` and `409 REFUND_EXCEEDS_PAID`, each with the limit in `details`.
    - `409 INVALID_TRANSITION` for drafts and void invoices.
    - `400 VALIDATION_ERROR` for bad amounts or reasons.
    - `403` for customers and technicians, `404` for another organisation.
  - The audit middleware records `invoices.credit-notes` and `invoices.refunds`.
- **Statuses:** `ISSUED`, `OVERDUE` and `PAID`. There is no PARTIALLY_PAID status: a partly paid
  invoice is `ISSUED` or `OVERDUE` with payments. Void stays limited to invoices with no payments, and
  now also requires that there are no credit notes.
- **One balance definition** (`invoice.balance.ts`), the same formula everywhere:
  owed = total minus credits, minus (payments minus refunds).
  - The balance is owed when positive; the refund due is minus owed when negative.
  - Creditable is the total minus credits; refundable is payments minus refunds.
  - Every invoice response includes `settlement` with these figures.
  - Payments, online payment, the PDF, the invoice page, the overdue job and the dashboard all use
    it.
  - Fixes the stage 21 mismatch: a void invoice's balance is 0 on both the page and the PDF.
- **Status effects:**
  - A credit that settles the balance: `PAID`.
  - A credit on a paid invoice: stays `PAID` with a refund due.
  - A refund that makes the customer owe again: `ISSUED`, or `OVERDUE` past the due date.
  - The overdue job skips invoices that owe nothing.
- **PDF:** totals show "Credit notes", "Refunded", the balance and "Refund due", followed by
  "Credit notes" and "Refunds" sections (date, number, reason, amount).
- **Dashboard:** "outstanding" is the sum of balances. New `refundDue` and `refundDueCount` values;
  the card mentions the refund due when there is one.
- **Frontend (invoice page):**
  - Credit note and refund lists, plus "Credit notes" and "Refunded" rows, the balance and the refund
    due in the totals, and a "Refund due" badge.
  - For admin and ops: creditable and refundable amounts, and **Issue credit note** and **Refund**
    buttons that open dialogs (React Hook Form + Zod, `adjustmentFormSchema` with the limit checked up
    front). The buttons only appear for allowed statuses with something left to credit or refund.
  - The customer sees the lists without the actions.
  - The schemas mirror the API (`creditStatusSchema`, `refundStatusSchema`).
- **Demo seed:** a few credit notes and refunds from a separate random stream:
  - supplier-warranty or goodwill credits on unpaid invoices;
  - a remaining balance written off on part-paid invoices;
  - credit-then-refund on paid invoices;
  - a returned bank transfer that reopens an invoice.
  - Deterministic with `DEMO_ANCHOR`.

## Tests
`billing.test.ts` → "credit notes and refunds":
- credits an issued invoice without touching its lines, numbers the notes, and marks it PAID when nothing is owed
- leaves a refund due after crediting a paid invoice, and refunds it without deleting the payment
- sends a refunded invoice past its due date to OVERDUE, and the overdue job skips invoices settled by credits
- rejects malformed amounts with 400, and credits or refunds over the limits with 409
- refuses drafts and void invoices with 409 INVALID_TRANSITION, and keeps void for invoices without payments or credits
- lets only admin and ops credit or refund, shows them to the customer, and hides other organisations' invoices
- never lets concurrent credits or refunds pass the limits (five parallel requests each; it fails reliably with the row lock removed)

## Not done
A payment gateway for refunds, refunds tied to one payment, the customer's GSTIN and reverse charge.
