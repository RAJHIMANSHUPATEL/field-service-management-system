import type { VisitProgressData } from "@/features/workOrders/components/VisitExecution";
import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";
import type { VisitStatus, WorkOrderStatus } from "@/lib/status";

export type RequestStatus = "SUBMITTED" | "NEEDS_INFO" | "REJECTED" | "ACCEPTED";
export type RequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type ServiceRequestNote = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
};

export type ServiceRequest = {
  id: string;
  description: string;
  preferredStart: string;
  preferredEnd: string;
  priority: RequestPriority;
  status: RequestStatus;
  customer: { id: string; name: string };
  asset: { id: string; equipmentType: string; model: string; serialNumber: string };
  address: { id: string; label: string; line1: string; city: string; state: string; postalCode: string };
  serviceType: { id: string; name: string };
  notes: ServiceRequestNote[];
  workOrder: {
    id: string;
    status: WorkOrderStatus;
    visits: ({ id: string; scheduledStart: string; status: VisitStatus } & VisitProgressData)[];
  } | null;
  attachments: RequestAttachment[];
};

export type RequestAttachment = { id: string; fileName: string; contentType: string; size: number; createdAt: string };

export const attachmentTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function uploadAttachment(requestId: string, file: File) {
  const result = await api<{ data: RequestAttachment }>(`/api/v1/service-requests/${requestId}/attachments`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
  });
  return result.data;
}

export async function attachmentUrl(requestId: string, attachmentId: string) {
  const result = await api<{ data: { url: string } }>(
    `/api/v1/service-requests/${requestId}/attachments/${attachmentId}`,
  );
  return result.data.url;
}

export type ServiceRequestListQuery = {
  status?: RequestStatus;
  open?: boolean;
  limit?: number;
};

export const serviceRequestKeys = {
  all: ["service-requests"] as const,
  list: (query: ServiceRequestListQuery) => ["service-requests", query] as const,
  detail: (id: string) => ["service-requests", id] as const,
};

function queryString(query: ServiceRequestListQuery) {
  const params = new URLSearchParams();
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.open) {
    params.set("open", "true");
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function listServiceRequests(query: ServiceRequestListQuery = {}) {
  return api<{ data: ServiceRequest[]; meta: PageMeta }>(`/api/v1/service-requests${queryString(query)}`);
}

export async function getServiceRequest(id: string) {
  const result = await api<{ data: ServiceRequest }>(`/api/v1/service-requests/${id}`);
  return result.data;
}

export async function createServiceRequest(input: {
  assetId: string;
  serviceTypeId: string;
  description: string;
  preferredStart: string;
  preferredEnd: string;
  priority?: RequestPriority;
}) {
  const result = await api<{ data: ServiceRequest }>("/api/v1/service-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function acceptServiceRequest(
  id: string,
  input: { priority?: RequestPriority; serviceTypeId?: string; note?: string },
) {
  const result = await api<{ data: ServiceRequest }>(`/api/v1/service-requests/${id}/accept`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function rejectServiceRequest(id: string, reason: string) {
  const result = await api<{ data: ServiceRequest }>(`/api/v1/service-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result.data;
}

export async function requestServiceInfo(id: string, message: string) {
  const result = await api<{ data: ServiceRequest }>(`/api/v1/service-requests/${id}/request-info`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  return result.data;
}

export async function replyToServiceRequest(id: string, message: string) {
  const result = await api<{ data: ServiceRequest }>(`/api/v1/service-requests/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  return result.data;
}
