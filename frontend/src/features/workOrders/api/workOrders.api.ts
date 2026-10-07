import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";
import type { RequestPriority } from "@/features/serviceRequests/api/serviceRequests.api";

import type { VisitStatus, WorkOrderStatus } from "@/lib/status";
import type { VisitStep } from "../schemas/workOrder.schema";

export type { VisitStatus, WorkOrderStatus };

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
  visits: Visit[];
  partRequests: PartRequest[];
  invoice: InvoiceRef | null;
  feedback: { rating: number; satisfied: boolean; comment: string | null } | null;
  maintenancePlan: { id: string; name: string; nextDueOn: string } | null;
  notes: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
};

export type VisitChange = {
  id: string;
  kind: "SCHEDULED" | "RESCHEDULED" | "REASSIGNED" | "CANCELLED";
  fromStart: string | null;
  toStart: string | null;
  fromTechnicianId: string | null;
  toTechnicianId: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string };
};

export type Visit = {
  id: string;
  scheduledStart: string;
  durationMinutes: number;
  status: VisitStatus;
  enRouteAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  endedAt: string | null;
  outcomeReason: string | null;
  diagnosis: string | null;
  workPerformed: string | null;
  signerName: string | null;
  signedAt: string | null;
  photos: VisitPhoto[];
  parts: VisitPart[];
  technician: { id: string; user: { name: string } };
  changes: VisitChange[];
};

export type VisitPhoto = { id: string; fileName: string; contentType: string; caption: string | null; createdAt: string };

export type VisitPart = {
  id: string;
  quantity: number;
  status: "RESERVED" | "CONSUMED" | "RELEASED" | "RETURNED";
  unitPrice: string;
  currency: string;
  part: { id: string; sku: string; name: string };
  warehouse: { id: string; name: string };
};

export async function addVisitPart(visitId: string, partId: string, quantity: number) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/parts`, {
    method: "POST",
    body: JSON.stringify({ partId, quantity }),
  });
  return result.data;
}

export async function moveVisitPart(visitId: string, visitPartId: string, action: "consume" | "release" | "return", reason?: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/parts/${visitPartId}/${action}`, {
    method: "POST",
    ...(reason ? { body: JSON.stringify({ reason }) } : {}),
  });
  return result.data;
}

export const photoTypes = ["image/jpeg", "image/png", "image/webp"];

export async function saveVisitReport(visitId: string, input: { diagnosis?: string; workPerformed?: string }) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/report`, { method: "PATCH", body: JSON.stringify(input) });
  return result.data;
}

export async function uploadVisitPhoto(visitId: string, file: File, caption?: string) {
  const headers: Record<string, string> = { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) };
  if (caption) {
    headers["X-Caption"] = encodeURIComponent(caption);
  }
  const result = await api<{ data: VisitPhoto }>(`/api/v1/visits/${visitId}/photos`, { method: "POST", body: file, headers });
  return result.data;
}

export async function visitPhotoUrl(visitId: string, photoId: string) {
  const result = await api<{ data: { url: string } }>(`/api/v1/visits/${visitId}/photos/${photoId}`);
  return result.data.url;
}

export async function visitSignatureUrl(visitId: string) {
  const result = await api<{ data: { url: string } }>(`/api/v1/visits/${visitId}/signature`);
  return result.data.url;
}

export async function signVisit(visitId: string, signerName: string, image: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/signature`, {
    method: "POST",
    body: JSON.stringify({ signerName, image }),
  });
  return result.data;
}

export async function completeVisit(visitId: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/complete`, { method: "POST" });
  return result.data;
}

export async function addWorkOrderNote(id: string, body: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
  return result.data;
}

export type Candidate = {
  technicianId: string;
  name: string;
  score: number;
  breakdown: { skill: number; area: number; workload: number };
  openJobs: number;
  hasSkill: boolean;
  inArea: boolean;
  available: boolean;
};

export type CalendarVisit = {
  id: string;
  scheduledStart: string;
  durationMinutes: number;
  status: VisitStatus;
  technician: { id: string; user: { name: string } };
  workOrder: {
    id: string;
    status: WorkOrderStatus;
    customer: { name: string };
    asset: { equipmentType: string };
    address: { city: string; postalCode: string };
  };
};

export type TimeOff = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  technician: { id: string; user: { name: string } };
};

export const workOrderKeys = {
  all: ["work-orders"] as const,
  detail: (id: string) => ["work-orders", id] as const,
  candidates: (id: string) => ["work-orders", id, "candidates"] as const,
  calendar: (from: string, to: string, technicianId: string) => ["calendar", from, to, technicianId] as const,
};

export async function listCandidates(id: string) {
  return (await api<{ data: Candidate[] }>(`/api/v1/work-orders/${id}/candidates`)).data;
}

export async function reassignWorkOrder(id: string, technicianId: string, reason: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/work-orders/${id}/reassign`, {
    method: "POST",
    body: JSON.stringify({ technicianId, reason }),
  });
  return result.data;
}

export async function rescheduleVisit(visitId: string, scheduledStart: string, reason: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledStart, reason }),
  });
  return result.data;
}

export async function cancelVisit(visitId: string, reason: string) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}

export async function getCalendar(from: string, to: string, technicianId: string) {
  const params = new URLSearchParams({ from, to, ...(technicianId ? { technicianId } : {}) });
  return (await api<{ data: { visits: CalendarVisit[]; timeOff: TimeOff[] } }>(`/api/v1/visits?${params}`)).data;
}

export async function addTimeOff(technicianId: string, input: { startsAt: string; endsAt: string; reason?: string }) {
  return api(`/api/v1/technicians/${technicianId}/time-off`, { method: "POST", body: JSON.stringify(input) });
}

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

export async function moveVisit(visitId: string, step: VisitStep) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/${step}`, { method: "POST" });
  return result.data;
}

export type PartRequest = {
  id: string;
  quantity: number;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  part: { id: string; sku: string; name: string };
};

export type UnsuccessfulInput = {
  outcome: "AWAITING_PARTS" | "FOLLOW_UP_REQUIRED";
  reason: string;
  partRequests: { partId: string; quantity: number }[];
};

export async function endVisitUnsuccessful(visitId: string, input: UnsuccessfulInput) {
  const result = await api<{ data: WorkOrder }>(`/api/v1/visits/${visitId}/unsuccessful`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function resolvePartRequest(id: string, action: "fulfil" | "cancel") {
  return api<{ data: unknown }>(`/api/v1/part-requests/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
}

export type InvoiceRef = { id: string; number: string | null; status: string; total: string; currency: string };
