import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listServiceAreasQuerySchema = pageQuerySchema;

export const createServiceAreaSchema = z.object({
  name: z.string().trim().min(1),
  postalCodes: z.array(z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/)).min(1),
  isActive: z.boolean().optional(),
});

export const updateServiceAreaSchema = createServiceAreaSchema.partial();

export type CreateServiceAreaInput = z.infer<typeof createServiceAreaSchema>;
export type UpdateServiceAreaInput = z.infer<typeof updateServiceAreaSchema>;
