import { api } from "@/lib/apiClient";

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hasLogin: boolean;
};

export type Address = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isPrimary: boolean;
};

export type CustomerAsset = {
  id: string;
  addressId: string;
  equipmentType: string;
  model: string;
  serialNumber: string;
  installedAt: string | null;
  warrantyExpiresAt: string | null;
  status: "ACTIVE" | "OUT_OF_SERVICE" | "DECOMMISSIONED";
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contacts: Contact[];
  addresses: Address[];
  assets: CustomerAsset[];
};

export const customerKeys = {
  all: ["customers"] as const,
  detail: (id: string) => ["customers", id] as const,
};

export async function listCustomers() {
  const result = await api<{ data: Customer[]; meta: PageMeta }>("/api/v1/customers");
  return result.data;
}

export async function getCustomer(id: string) {
  const result = await api<{ data: Customer }>(`/api/v1/customers/${id}`);
  return result.data;
}

export async function createCustomer(input: { name: string; phone?: string; email?: string }) {
  const result = await api<{ data: Customer }>("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function createContact(
  customerId: string,
  input: { name: string; email: string; phone?: string; password?: string },
) {
  const result = await api<{ data: Contact }>(`/api/v1/customers/${customerId}/contacts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function createAddress(
  customerId: string,
  input: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  },
) {
  const result = await api<{ data: Address }>(`/api/v1/customers/${customerId}/addresses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}
