import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  method: string;
  path: string;
  status: number;
  createdAt: string;
  actor: { id: string; name: string; role: string } | null;
};

export const auditEventKeys = {
  page: (page: number) => ["audit-events", page] as const,
};

export async function listAuditEvents(page: number) {
  return api<{ data: AuditEvent[]; meta: PageMeta }>(`/api/v1/audit-events?page=${page}&limit=50`);
}
