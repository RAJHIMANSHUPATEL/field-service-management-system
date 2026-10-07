import { z } from "zod";

export const createRequestSchema = z
  .object({
    assetId: z.string().min(1, "Choose equipment"),
    serviceTypeId: z.string().min(1, "Choose a service type"),
    description: z.string().trim().min(1, "Describe the problem"),
    preferredStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    preferredEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  })
  .refine((value) => value.preferredEnd >= value.preferredStart, {
    path: ["preferredEnd"],
    message: "End date must be on or after the start date",
  });

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const messageSchema = z.object({
  message: z.string().trim().min(1, "Write a message"),
});

export type MessageInput = z.infer<typeof messageSchema>;
