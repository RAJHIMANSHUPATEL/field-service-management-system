import { z } from "zod";

export const invoiceStatusSchema = z.enum(["DRAFT", "ISSUED", "OVERDUE", "PAID", "VOID"]);
type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

// Statuses with a downloadable PDF, mirroring the API (GET /invoices/:id/pdf answers 409 for a draft).
// "Partially paid" is ISSUED or OVERDUE with payments, so it is covered.
export const invoicePdfStatusSchema = invoiceStatusSchema.extract(["ISSUED", "OVERDUE", "PAID", "VOID"]);

export function canDownloadInvoicePdf(status: InvoiceStatus) {
  return invoicePdfStatusSchema.safeParse(status).success;
}

// Credit notes and refunds, mirroring backend invoice.balance.ts: issued, overdue (both possibly
// partly paid) or paid invoices; never drafts or void ones.
export const creditStatusSchema = invoiceStatusSchema.extract(["ISSUED", "OVERDUE", "PAID"]);
export const refundStatusSchema = invoiceStatusSchema.extract(["ISSUED", "OVERDUE", "PAID"]);

export function canCredit(status: InvoiceStatus, creditable: string) {
  return creditStatusSchema.safeParse(status).success && Number(creditable) > 0;
}

export function canRefund(status: InvoiceStatus, refundable: string) {
  return refundStatusSchema.safeParse(status).success && Number(refundable) > 0;
}

// The body of POST /invoices/:id/credit-notes and /refunds, as the API validates it, plus the limit
// the API enforces with 409 (CREDIT_EXCEEDS_REMAINING / REFUND_EXCEEDS_PAID) checked up front.
export function adjustmentFormSchema(limit: string, limitLabel: string) {
  return z.object({
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 1250.00")
      .refine((value) => Number(value) > 0, "The amount must be more than zero")
      .refine((value) => Math.round(Number(value) * 100) <= Math.round(Number(limit) * 100), `At most ${limitLabel}`),
    reason: z.string().trim().min(1, "Give a reason").max(500, "Keep the reason under 500 characters"),
  });
}

export type AdjustmentFormInput = z.infer<ReturnType<typeof adjustmentFormSchema>>;

// GET /api/v1/invoices/payment-options. Customers see "Pay" only when onlinePay is true: the API
// keeps it false while the only payment provider is the local mock.
export const paymentOptionsSchema = z.object({ onlinePay: z.boolean() });
export type PaymentOptions = z.infer<typeof paymentOptionsSchema>;
