import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listPartsQuerySchema = pageQuerySchema;

export const createPartSchema = z.object({
  sku: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  unitPrice: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 1250.00"),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).optional(),
  isSerialized: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updatePartSchema = createPartSchema.partial();

export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
