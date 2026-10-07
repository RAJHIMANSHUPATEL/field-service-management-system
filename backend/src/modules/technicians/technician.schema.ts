import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listTechniciansQuerySchema = pageQuerySchema;

export const createTechnicianSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  password: z.string().min(8),
  phone: z.string().trim().min(1).optional(),
});

export const updateTechnicianSchema = z.object({
  phone: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
