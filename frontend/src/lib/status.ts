export const workOrderStatuses = ["OPEN", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export const visitStatuses = ["SCHEDULED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type VisitStatus = (typeof visitStatuses)[number];

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

const visitStatusLabels: Record<VisitStatus, string> = {
  SCHEDULED: "Scheduled",
  EN_ROUTE: "En route",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function workOrderStatusLabel(status: WorkOrderStatus) {
  return workOrderStatusLabels[status];
}

export function visitStatusLabel(status: VisitStatus) {
  return visitStatusLabels[status];
}
