import type { WorkOrderStatus } from "../../generated/prisma/client.js";

// A work order can get a (new) visit planned when it is assigned, or when visit one ended
// without finishing and the job is ready for visit two.
export const schedulableStatuses: WorkOrderStatus[] = ["ASSIGNED", "FOLLOW_UP_REQUIRED"];

export function canSchedule(status: WorkOrderStatus) {
  return schedulableStatuses.includes(status);
}

// Outcomes of an unsuccessful visit. Both keep the work order open.
export const unsuccessfulOutcomes = ["AWAITING_PARTS", "FOLLOW_UP_REQUIRED"] as const;
export type UnsuccessfulOutcome = (typeof unsuccessfulOutcomes)[number];

// Once every part request is resolved, a job waiting for parts is ready for visit two.
export const partsArrivedTransition = { from: "AWAITING_PARTS", to: "FOLLOW_UP_REQUIRED" } as const;
