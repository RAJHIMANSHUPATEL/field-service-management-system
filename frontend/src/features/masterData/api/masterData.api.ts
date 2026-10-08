import { api, setAccessToken } from "@/lib/apiClient";
import type { AuthUser } from "@/features/auth/api/auth.api";
import type { PageMeta } from "@/features/customers/api/customers.api";
import type { RegisterInput } from "../schemas/masterData.schema";

export type Skill = { id: string; name: string; isActive: boolean };
export type ServiceArea = { id: string; name: string; postalCodes: string[]; isActive: boolean };
export type Part = {
  id: string;
  sku: string;
  name: string;
  unitPrice: string;
  reorderLevel: number;
  currency: string;
  isSerialized: boolean;
  isActive: boolean;
};
export type Warehouse = {
  id: string;
  name: string;
  kind: "WAREHOUSE" | "VAN";
  isActive: boolean;
  technician: { id: string; user: { name: string } } | null;
};

export type Catalog = "skills" | "service-areas" | "parts" | "warehouses";

export type Organization = {
  id: string;
  name: string;
  gstState: string | null;
  gstStateName: string | null;
  taxRatePercent: string;
  paymentTermsDays: number;
};
export type GstState = { code: string; abbreviation: string; name: string };

export async function getOrganization() {
  return (await api<{ data: Organization }>("/api/v1/organization")).data;
}

export async function listGstStates() {
  return (await api<{ data: GstState[] }>("/api/v1/organization/gst-states")).data;
}

export async function updateOrganization(input: { gstState: string }) {
  return (await api<{ data: Organization }>("/api/v1/organization", { method: "PATCH", body: JSON.stringify(input) })).data;
}

export const masterDataKeys = {
  catalog: (catalog: Catalog) => ["master-data", catalog] as const,
  organization: ["master-data", "organization"] as const,
  gstStates: ["master-data", "gst-states"] as const,
};

export async function listCatalog<T>(catalog: Catalog) {
  return (await api<{ data: T[]; meta: PageMeta }>(`/api/v1/${catalog}?limit=100`)).data;
}

export async function createCatalogItem<T>(catalog: Catalog, input: unknown) {
  return (await api<{ data: T }>(`/api/v1/${catalog}`, { method: "POST", body: JSON.stringify(input) })).data;
}

export async function updateCatalogItem<T>(catalog: Catalog, id: string, input: unknown) {
  return (await api<{ data: T }>(`/api/v1/${catalog}/${id}`, { method: "PATCH", body: JSON.stringify(input) })).data;
}

export async function registerOrganization(input: RegisterInput) {
  const result = await api<{ data: { accessToken: string; user: AuthUser } }>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
    skipRefresh: true,
  });
  setAccessToken(result.data.accessToken);
  return result.data.user;
}
