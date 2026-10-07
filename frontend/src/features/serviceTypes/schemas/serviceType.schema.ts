import { z } from "zod";

export const createServiceTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  serviceCharge: z.string().trim().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Use an amount like 500.00"),
  labourRatePerHour: z.string().trim().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Use an amount like 500.00"),
});

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;
