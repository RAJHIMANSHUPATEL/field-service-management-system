import { z } from "zod";

export const createServiceTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional().or(z.literal("")),
});

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;
