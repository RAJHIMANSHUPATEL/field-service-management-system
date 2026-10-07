import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";

export type ServiceType = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export const serviceTypeKeys = {
  all: ["service-types"] as const,
};

export async function listServiceTypes() {
  const result = await api<{ data: ServiceType[]; meta: PageMeta }>("/api/v1/service-types");
  return result.data;
}

export async function createServiceType(input: { name: string; description?: string }) {
  const result = await api<{ data: ServiceType }>("/api/v1/service-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}
