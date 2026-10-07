import { z } from "zod";

export const listPartRequestsQuerySchema = z.object({
  status: z.enum(["OPEN", "FULFILLED", "CANCELLED"]).optional(),
});

export const resolvePartRequestSchema = z.object({ note: z.string().trim().max(500).optional() });

export type ListPartRequestsQuery = z.infer<typeof listPartRequestsQuerySchema>;
