import type { InvoiceStatus } from "../../generated/prisma/client.js";

export type InvoiceAction = "issue" | "pay" | "void" | "overdue";

export const invoiceTransitions: Record<InvoiceAction, { from: InvoiceStatus[]; to: InvoiceStatus }> = {
  issue: { from: ["DRAFT"], to: "ISSUED" },
  pay: { from: ["ISSUED", "OVERDUE"], to: "PAID" },
  void: { from: ["DRAFT", "ISSUED", "OVERDUE"], to: "VOID" },
  overdue: { from: ["ISSUED"], to: "OVERDUE" },
};

export const editableStatuses: InvoiceStatus[] = ["DRAFT"];

export function canInvoice(action: InvoiceAction, status: InvoiceStatus) {
  return invoiceTransitions[action].from.includes(status);
}
