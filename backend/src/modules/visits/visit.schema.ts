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

export const photoParamsSchema = z.object({ id: z.string().min(1), photoId: z.string().min(1) });

export const visitReportSchema = z
  .object({
    diagnosis: z.string().trim().min(1).max(5000).optional(),
    workPerformed: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((value) => value.diagnosis !== undefined || value.workPerformed !== undefined, {
    message: "Send a diagnosis or the work performed",
  });

export const photoTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxPhotoBytes = 10 * 1024 * 1024;

export const uploadPhotoSchema = z.object({
  contentType: z.enum(photoTypes),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((value) => value.replace(/[^\w. -]/g, "_")),
  caption: z.string().trim().max(200).optional(),
});

const pngDataUrl = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;

// The signature arrives as a PNG data URL from the signature pad.
export const signatureSchema = z.object({
  signerName: z.string().trim().min(1).max(120),
  image: z
    .string()
    .max(2_000_000)
    .regex(pngDataUrl, "Send the signature as a PNG data URL")
    .transform((value) => Buffer.from(value.replace(pngDataUrl, "$1"), "base64"))
    .refine((buffer) => buffer.length > 8 && buffer.subarray(1, 4).toString() === "PNG", "The signature is not a PNG"),
});

export type VisitReportInput = z.infer<typeof visitReportSchema>;
export type SignatureInput = z.infer<typeof signatureSchema>;

export const unsuccessfulVisitSchema = z.object({
  outcome: z.enum(["AWAITING_PARTS", "FOLLOW_UP_REQUIRED"]),
  reason: z.string().trim().min(1).max(1000),
  partRequests: z
    .array(
      z.object({
        partId: z.string().min(1),
        quantity: z.number().int().min(1).max(10_000),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .max(20)
    .default([]),
});

export type UnsuccessfulVisitInput = z.infer<typeof unsuccessfulVisitSchema>;
