import { Prisma } from "../../generated/prisma/client.js";
import type { InvoiceStatus } from "../../generated/prisma/client.js";

const Decimal = Prisma.Decimal;
type Money = Prisma.Decimal | string | number;

// Credit notes and refunds apply to an invoice that has been issued and not voided. There is no
// PARTIALLY_PAID status: a partly paid invoice is ISSUED or OVERDUE with payments.
export const creditStatuses: readonly InvoiceStatus[] = ["ISSUED", "OVERDUE", "PAID"];
export const refundStatuses: readonly InvoiceStatus[] = ["ISSUED", "OVERDUE", "PAID"];

export type Ledger = { status: InvoiceStatus; total: Money; creditedTotal: Money; amountPaid: Money; refundedTotal: Money };

// The one balance definition, used by the API, the PDF, payments, the overdue job and the dashboard:
//   owed = (total - credits) - (payments - refunds)
// A positive owed is the balance due; a negative one is money the customer is owed back (refund due).
// A void invoice owes nothing either way. Creditable: what is left of the total after credits.
// Refundable: what has been paid and not yet refunded.
export function settlementOf(invoice: Ledger) {
  const netTotal = new Decimal(invoice.total).sub(invoice.creditedTotal);
  const netPaid = new Decimal(invoice.amountPaid).sub(invoice.refundedTotal);
  const owed = invoice.status === "VOID" ? new Decimal(0) : netTotal.sub(netPaid);
  const zero = new Decimal(0);
  return {
    netTotal,
    netPaid,
    owed,
    balance: Decimal.max(owed, zero),
    refundDue: Decimal.max(owed.neg(), zero),
    creditable: creditStatuses.includes(invoice.status) ? netTotal : zero,
    refundable: refundStatuses.includes(invoice.status) ? netPaid : zero,
  };
}

// The same figures as two-decimal strings, as the API returns them.
export function settlement(invoice: Ledger) {
  const figures = settlementOf(invoice);
  return {
    netTotal: figures.netTotal.toFixed(2),
    netPaid: figures.netPaid.toFixed(2),
    balance: figures.balance.toFixed(2),
    refundDue: figures.refundDue.toFixed(2),
    creditable: figures.creditable.toFixed(2),
    refundable: figures.refundable.toFixed(2),
  };
}

// Status after a credit or refund changes what is owed. Settled (owed <= 0): an issued or overdue
// invoice becomes PAID. Owing again after a refund: a PAID invoice goes back to ISSUED, or OVERDUE
// when its due date has passed. Anything else keeps its status.
export function statusAfter(
  current: InvoiceStatus,
  owed: Prisma.Decimal,
  dueAt: Date | null,
  now: Date,
): { status: InvoiceStatus; paidAt?: Date | null } {
  if (owed.lte(0) && (current === "ISSUED" || current === "OVERDUE")) {
    return { status: "PAID", paidAt: now };
  }
  if (owed.gt(0) && current === "PAID") {
    return { status: dueAt && dueAt < now ? "OVERDUE" : "ISSUED", paidAt: null };
  }
  return { status: current };
}
