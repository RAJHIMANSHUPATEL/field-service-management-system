import { pageQuerySchema } from "../../lib/pagination.js";
import { z } from "zod";

const amount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 1250.00");

export const listInvoicesQuerySchema = pageQuerySchema.extend({
  status: z.enum(["DRAFT", "ISSUED", "OVERDUE", "PAID", "VOID"]).optional(),
});

export const updateInvoiceSchema = z
  .object({ discount: amount.optional(), notes: z.string().trim().max(2000).nullable().optional() })
  .refine((value) => value.discount !== undefined || value.notes !== undefined, { message: "Nothing to update" });

export const addLineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: amount.refine((value) => Number(value) > 0, "The amount must be more than zero"),
});

export const recordPaymentSchema = z.object({
  amount: amount.refine((value) => Number(value) > 0, "The amount must be more than zero"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER"]),
  reference: z.string().trim().max(120).optional(),
  paidAt: z.iso.datetime().optional(),
});

// A credit note or a refund: a positive amount with at most two decimals, and why.
const adjustmentSchema = z.object({
  amount: amount.refine((value) => Number(value) > 0, "The amount must be more than zero"),
  reason: z.string().trim().min(1, "Give a reason").max(500),
});
export const creditNoteSchema = adjustmentSchema;
export const refundSchema = adjustmentSchema;

export const voidInvoiceSchema = z.object({ reason: z.string().trim().min(1).max(500) });

// GET /invoices/payment-options: what a customer may pay with (the controller parses its own answer).
export const paymentOptionsSchema = z.object({ onlinePay: z.boolean() }).strict();

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type AddLineInput = z.infer<typeof addLineSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type PaymentOptions = z.infer<typeof paymentOptionsSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
