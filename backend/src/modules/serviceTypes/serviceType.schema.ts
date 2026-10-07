import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listServiceTypesQuerySchema = pageQuerySchema;

export const createServiceTypeSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  requiredSkillId: z.string().min(1).nullable().optional(),
  serviceCharge: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 500.00").optional(),
  labourRatePerHour: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 500.00").optional(),
  sacCode: z.string().trim().regex(/^\d{4,8}$/, "Use a 4 to 8 digit SAC code").nullable().optional(),
});

export const updateServiceTypeSchema = createServiceTypeSchema.partial();

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>;
