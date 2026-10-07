export const workOrderStatuses = ["OPEN", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export const visitStatuses = ["SCHEDULED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "CANCELLED"] as const;
export type VisitStatus = (typeof visitStatuses)[number];

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
};

const visitStatusLabels: Record<VisitStatus, string> = {
  SCHEDULED: "Scheduled",
  EN_ROUTE: "En route",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  CANCELLED: "Cancelled",
};

export function workOrderStatusLabel(status: WorkOrderStatus) {
  return workOrderStatusLabels[status];
}

export function visitStatusLabel(status: VisitStatus) {
  return visitStatusLabels[status];
}
