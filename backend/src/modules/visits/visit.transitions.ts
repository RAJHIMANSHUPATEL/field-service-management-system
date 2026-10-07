import type { VisitStatus } from "../../generated/prisma/client.js";

export type VisitStep = "en-route" | "arrive" | "start" | "complete";

// Each step moves the visit from exactly one status to the next.
export const visitTransitions: Record<VisitStep, { from: VisitStatus; to: VisitStatus }> = {
  "en-route": { from: "SCHEDULED", to: "EN_ROUTE" },
  arrive: { from: "EN_ROUTE", to: "ARRIVED" },
  start: { from: "ARRIVED", to: "IN_PROGRESS" },
  complete: { from: "IN_PROGRESS", to: "COMPLETED" },
};

// The step's timestamp column, recorded when the step happens.
export const stepTimestamp = {
  "en-route": "enRouteAt",
  arrive: "arrivedAt",
  start: "startedAt",
  complete: "completedAt",
} as const;

// The technician records findings, photos and the report on site.
export const reportableStatuses: VisitStatus[] = ["ARRIVED", "IN_PROGRESS"];
// The customer signs once the work is done, before completion.
export const signableStatuses: VisitStatus[] = ["IN_PROGRESS"];

export function canMoveVisit(step: VisitStep, current: VisitStatus) {
  return visitTransitions[step].from === current;
}

// Planning changes made by admin or ops. Only a visit that has not started can move or be cancelled;
// once the technician is en route the outcome is recorded on the visit instead.
export const plannableStatuses: VisitStatus[] = ["SCHEDULED"];

export function canReplan(current: VisitStatus) {
  return plannableStatuses.includes(current);
}

// A visit on site can end without finishing; the work order then waits for parts or a follow-up.
export const unsuccessfulFrom: VisitStatus[] = ["ARRIVED", "IN_PROGRESS"];
