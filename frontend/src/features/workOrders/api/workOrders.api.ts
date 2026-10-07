import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";
import type { RequestPriority } from "@/features/serviceRequests/api/serviceRequests.api";

export type WorkOrderStatus = "OPEN" | "ASSIGNED" | "ACCEPTED";
export type VisitStatus = "SCHEDULED" | "CANCELLED";

export type WorkOrder = {
  id: string;
  description: string;
  priority: RequestPriority;
  status: WorkOrderStatus;
  createdAt: string;
  customer: { id: string; name: string };
  asset: { id: string; equipmentType: string; model: string; serialNumber: string };
  address: { id: string; label: string; line1: string; city: string; state: string; postalCode: string };
  serviceType: { id: string; name: string };
  request: { id: string; status: string; preferredStart: string; preferredEnd: string };
  technician: { id: string; user: { id: string; name: string } } | null;
  visits: { id: string; scheduledStart: string; status: VisitStatus }[];
  notes: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
};

export const workOrderKeys = {
  all: ["work-orders"] as const,
  detail: (id: string) => ["work-orders", id] as const,
};

export async function listWorkOrders() {
  const result = await api<{ data: WorkOrder[]; meta: PageMeta }>("/api/v1/work-orders");
  return result.data;
}

export async function getWorkOrder(id: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}`);
  return result.data;
}

export async function assignWorkOrder(id: string, technicianId: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ technicianId }),
  });
  return result.data;
}

export async function scheduleWorkOrder(id: string, scheduledStart: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledStart }),
  });
  return result.data;
}

export async function acceptWorkOrder(id: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/accept`, { method: "POST" });
  return result.data;
}

export async function declineWorkOrder(id: string, reason: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}
