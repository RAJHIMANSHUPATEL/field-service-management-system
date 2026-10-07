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
