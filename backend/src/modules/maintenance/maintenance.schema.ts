import { z } from "zod";

export const createPlanSchema = z.object({
  assetId: z.string().min(1),
  serviceTypeId: z.string().min(1),
  contractId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  intervalDays: z.number().int().min(1).max(3660),
  leadDays: z.number().int().min(0).max(90).default(0),
  firstDueOn: z.iso.date(),
});

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    intervalDays: z.number().int().min(1).max(3660).optional(),
    leadDays: z.number().int().min(0).max(90).optional(),
    nextDueOn: z.iso.date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Change at least one field" });

export const listPlansQuerySchema = z.object({
  customerId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
