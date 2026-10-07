import { api } from "@/lib/apiClient";

export type Channel = "IN_APP" | "EMAIL" | "SMS";
export type DeliveryStatus = "PENDING" | "SENT" | "FAILED";

export const channelLabels: Record<Channel, string> = { IN_APP: "In-app", EMAIL: "Email", SMS: "SMS" };
export const audienceLabels = { CUSTOMER: "Customer", TECHNICIAN: "Technician", OPS: "Operations" } as const;

export type Notification = {
  id: string;
  event: string;
  audience: keyof typeof audienceLabels;
  channel: Channel;
  subject: string;
  body: string;
  link: string | null;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  recipient: { id: string; name: string; role: string };
};

export type NotificationRule = {
  id: string;
  event: string;
  audience: keyof typeof audienceLabels;
  channels: Channel[];
  subject: string;
  body: string;
  isEnabled: boolean;
};

export type Feedback = {
  id: string;
  rating: number;
  satisfied: boolean;
  comment: string | null;
  createdAt: string;
  author: { id: string; name: string };
  workOrder: {
    id: string;
    requestId: string;
    customer: { id: string; name: string };
    asset: { equipmentType: string };
    technician: { id: string; user: { name: string } } | null;
  };
};

export const notificationKeys = {
  inbox: ["notifications", "inbox"] as const,
  deliveries: (status?: DeliveryStatus) => ["notifications", "deliveries", status ?? "all"] as const,
  rules: ["notifications", "rules"] as const,
  feedback: ["feedback"] as const,
};

export function inbox() {
  return api<{ data: Notification[]; meta: { unread: number } }>("/api/v1/notifications");
}

export function markRead(id: string) {
  return api(`/api/v1/notifications/${id}/read`, { method: "POST" });
}

export async function listDeliveries(status?: DeliveryStatus) {
  return (await api<{ data: Notification[] }>(`/api/v1/notifications/deliveries${status ? `?status=${status}` : ""}`)).data;
}

export function retryDelivery(id: string) {
  return api(`/api/v1/notifications/deliveries/${id}/retry`, { method: "POST" });
}

export async function listRules() {
  return (await api<{ data: NotificationRule[] }>("/api/v1/notifications/rules")).data;
}

export function updateRule(id: string, input: Partial<Pick<NotificationRule, "isEnabled" | "channels">>) {
  return api(`/api/v1/notifications/rules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function runSweep() {
  return api<{ data: { notified: number } }>("/api/v1/notifications/sweep", { method: "POST" });
}

export function listFeedback() {
  return api<{ data: Feedback[]; meta: { count: number; averageRating: number | null; satisfiedPercent: number | null } }>(
    "/api/v1/feedback",
  );
}

export function submitFeedback(workOrderId: string, input: { rating: number; satisfied: boolean; comment?: string }) {
  return api(`/api/v1/work-orders/${workOrderId}/feedback`, { method: "POST", body: JSON.stringify(input) });
}
