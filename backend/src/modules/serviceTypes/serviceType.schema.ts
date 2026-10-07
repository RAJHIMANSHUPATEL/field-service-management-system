import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listServiceTypesQuerySchema = pageQuerySchema;

export const createServiceTypeSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  requiredSkillId: z.string().min(1).nullable().optional(),
});

export const updateServiceTypeSchema = createServiceTypeSchema.partial();

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>;
