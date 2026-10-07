import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listWarehousesQuerySchema = pageQuerySchema;

export const createWarehouseSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(["WAREHOUSE", "VAN"]).optional(),
  technicianId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
