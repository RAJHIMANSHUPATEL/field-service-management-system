import { z } from "zod";

export const invoiceStatusSchema = z.enum(["DRAFT", "ISSUED", "OVERDUE", "PAID", "VOID"]);

// Statuses with a downloadable PDF, mirroring the API (GET /invoices/:id/pdf answers 409 for a draft).
// "Partially paid" is ISSUED or OVERDUE with payments, so it is covered.
export const invoicePdfStatusSchema = invoiceStatusSchema.extract(["ISSUED", "OVERDUE", "PAID", "VOID"]);

export function canDownloadInvoicePdf(status: z.infer<typeof invoiceStatusSchema>) {
  return invoicePdfStatusSchema.safeParse(status).success;
}
