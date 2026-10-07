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
  skillIds: z.array(z.string().min(1)).optional(),
  serviceAreaIds: z.array(z.string().min(1)).optional(),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;

export const createTimeOffSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().min(1).optional(),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;
