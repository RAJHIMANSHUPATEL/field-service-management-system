import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listSkillsQuerySchema = pageQuerySchema;

export const createSkillSchema = z.object({
  name: z.string().trim().min(1),
  isActive: z.boolean().optional(),
});

export const updateSkillSchema = createSkillSchema.partial();

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
