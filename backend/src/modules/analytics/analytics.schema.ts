import { z } from "zod";

export const periodQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, { message: "from must be before to", path: ["to"] });
