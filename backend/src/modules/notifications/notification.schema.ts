import { z } from "zod";

export const channelSchema = z.enum(["IN_APP", "EMAIL", "SMS"]);

export const listDeliveriesQuerySchema = z.object({
  event: z.string().min(1).optional(),
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
});

export const updateRuleSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    channels: z.array(channelSchema).min(1).max(3).optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Change at least one field" });
