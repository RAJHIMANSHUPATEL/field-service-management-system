import { z } from "zod";

export const createTechnicianSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().trim().min(1).optional().or(z.literal("")),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
