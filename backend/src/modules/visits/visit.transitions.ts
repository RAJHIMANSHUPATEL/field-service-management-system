import type { VisitStatus } from "../../generated/prisma/client.js";

export type VisitStep = "en-route" | "arrive" | "start";

// Each step moves the visit from exactly one status to the next.
export const visitTransitions: Record<VisitStep, { from: VisitStatus; to: VisitStatus }> = {
  "en-route": { from: "SCHEDULED", to: "EN_ROUTE" },
  arrive: { from: "EN_ROUTE", to: "ARRIVED" },
  start: { from: "ARRIVED", to: "IN_PROGRESS" },
};

export function canMoveVisit(step: VisitStep, current: VisitStatus) {
  return visitTransitions[step].from === current;
}

// Planning changes made by admin or ops. Only a visit that has not started can move or be cancelled;
// once the technician is en route the outcome is recorded on the visit instead.
export const plannableStatuses: VisitStatus[] = ["SCHEDULED"];

export function canReplan(current: VisitStatus) {
  return plannableStatuses.includes(current);
}
