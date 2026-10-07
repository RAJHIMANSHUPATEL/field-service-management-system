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

export const masterDataKeys = {
  catalog: (catalog: Catalog) => ["master-data", catalog] as const,
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
