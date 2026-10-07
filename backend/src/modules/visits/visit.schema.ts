import { z } from "zod";

export const visitParamsSchema = z.object({
  id: z.string().min(1),
});

export type VisitParams = z.infer<typeof visitParamsSchema>;

export const rescheduleVisitSchema = z.object({
  scheduledStart: z.iso.datetime(),
  durationMinutes: z.number().int().min(15).max(12 * 60).optional(),
  reason: z.string().trim().min(1),
});

export const cancelVisitSchema = z.object({
  reason: z.string().trim().min(1),
});

export const calendarQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    technicianId: z.string().min(1).optional(),
  })
  .refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), { message: "to must be after from" })
  .refine((value) => new Date(value.to).getTime() - new Date(value.from).getTime() <= 62 * 24 * 60 * 60_000, {
    message: "Ask for at most 62 days",
  });

export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
