import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";

export type Asset = {
  id: string;
  customerId: string;
  addressId: string;
  equipmentType: string;
  model: string;
  serialNumber: string;
  installedAt: string | null;
  warrantyExpiresAt: string | null;
  status: "ACTIVE" | "OUT_OF_SERVICE" | "DECOMMISSIONED";
  address?: {
    id: string;
    label: string;
    line1: string;
    city: string;
  };
};

export const assetKeys = {
  customer: (customerId: string) => ["assets", customerId] as const,
};

export async function listAssets(customerId: string) {
  const result = await api<{ data: Asset[]; meta: PageMeta }>(
    `/api/v1/assets?customerId=${encodeURIComponent(customerId)}`,
  );
  return result.data;
}

export async function createAsset(input: {
  customerId: string;
  addressId: string;
  equipmentType: string;
  model: string;
  serialNumber: string;
  installedAt?: string;
  warrantyExpiresAt?: string;
}) {
  const result = await api<{ data: Asset }>("/api/v1/assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function updateAsset(
  id: string,
  input: {
    addressId?: string;
    equipmentType?: string;
    model?: string;
    serialNumber?: string;
    installedAt?: string;
    warrantyExpiresAt?: string;
    status?: Asset["status"];
  },
) {
  const result = await api<{ data: Asset }>(`/api/v1/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.data;
}
