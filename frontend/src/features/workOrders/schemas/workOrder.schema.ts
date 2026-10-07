import { z } from "zod";
import { visitStatuses, workOrderStatuses } from "@/lib/status";

export const workOrderStatusSchema = z.enum(workOrderStatuses);
export const visitStatusSchema = z.enum(visitStatuses);

export const visitStepSchema = z.enum(["en-route", "arrive", "start"]);
export type VisitStep = z.infer<typeof visitStepSchema>;

// Mirrors the API transition map: each step moves one status to the next.
export const visitSteps: Record<VisitStep, { from: z.infer<typeof visitStatusSchema>; label: string; done: string }> = {
  "en-route": { from: "SCHEDULED", label: "On my way", done: "Marked en route" },
  arrive: { from: "EN_ROUTE", label: "I've arrived", done: "Marked arrived" },
  start: { from: "ARRIVED", label: "Start job", done: "Job started" },
};

export function nextVisitStep(status: z.infer<typeof visitStatusSchema>): VisitStep | null {
  const match = visitStepSchema.options.find((step) => visitSteps[step].from === status);
  return match ?? null;
}
