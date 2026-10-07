import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";

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
  workOrder: { id: string; status: "OPEN" } | null;
};

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

export async function acceptServiceRequest(id: string, input: { priority?: RequestPriority; note?: string }) {
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
