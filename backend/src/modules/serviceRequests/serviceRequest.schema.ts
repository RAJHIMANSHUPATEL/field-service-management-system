import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const status = z.enum(["SUBMITTED", "NEEDS_INFO", "REJECTED", "ACCEPTED"]);

export const listServiceRequestsQuerySchema = pageQuerySchema.extend({
  status: status.optional(),
  open: z.enum(["true"]).optional(),
});

export const createServiceRequestSchema = z.object({
  assetId: z.string().min(1),
  serviceTypeId: z.string().min(1),
  description: z.string().trim().min(1),
  preferredStart: dateOnly,
  preferredEnd: dateOnly,
  priority: priority.optional(),
});

export const acceptServiceRequestSchema = z.object({
  priority: priority.optional(),
  note: z.string().trim().min(1).optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(1),
});

export const messageSchema = z.object({
  message: z.string().trim().min(1),
});

export type ListServiceRequestsQuery = z.infer<typeof listServiceRequestsQuerySchema>;
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type AcceptServiceRequestInput = z.infer<typeof acceptServiceRequestSchema>;

export function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
