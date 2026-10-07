import { z } from "zod";

const id = z.string().min(1);
const quantity = z.number().int().min(1).max(100_000);
const reason = z.string().trim().min(1).max(500);

export const receiptSchema = z.object({ warehouseId: id, partId: id, quantity, reason });

export const transferSchema = z
  .object({ fromWarehouseId: id, toWarehouseId: id, partId: id, quantity, reason })
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, { message: "Pick two different locations" });

export const adjustmentSchema = z.object({
  warehouseId: id,
  partId: id,
  quantityDelta: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0, "The change cannot be zero"),
  reason,
});

export const stockQuerySchema = z.object({ warehouseId: id.optional(), partId: id.optional() });

export const movementQuerySchema = z.object({
  warehouseId: id.optional(),
  partId: id.optional(),
  visitId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const addVisitPartSchema = z.object({ partId: id, quantity, warehouseId: id.optional() });
export const visitPartParamsSchema = z.object({ id, visitPartId: id });
export const returnVisitPartSchema = z.object({ reason });

export type ReceiptInput = z.infer<typeof receiptSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
export type AddVisitPartInput = z.infer<typeof addVisitPartSchema>;
