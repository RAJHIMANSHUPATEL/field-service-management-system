import { z } from "zod";

export const visitParamsSchema = z.object({
  id: z.string().min(1),
});

export type VisitParams = z.infer<typeof visitParamsSchema>;
