import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listWorkOrdersQuerySchema = pageQuerySchema;

export const assignWorkOrderSchema = z.object({
  technicianId: z.string().min(1),
});

export const scheduleWorkOrderSchema = z.object({
  scheduledStart: z.iso.datetime(),
  durationMinutes: z.number().int().min(15).max(12 * 60).optional(),
});

export const reassignWorkOrderSchema = z.object({
  technicianId: z.string().min(1),
  reason: z.string().trim().min(1),
});

export const candidatesQuerySchema = z.object({
  at: z.iso.datetime().optional(),
});

export const declineWorkOrderSchema = z.object({
  reason: z.string().trim().min(1),
});

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;
export type ScheduleWorkOrderInput = z.infer<typeof scheduleWorkOrderSchema>;
export type DeclineWorkOrderInput = z.infer<typeof declineWorkOrderSchema>;
export type ReassignWorkOrderInput = z.infer<typeof reassignWorkOrderSchema>;

export const addNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) });
