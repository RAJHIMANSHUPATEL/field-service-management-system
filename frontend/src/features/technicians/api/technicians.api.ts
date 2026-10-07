import { api } from "@/lib/apiClient";
import type { PageMeta } from "@/features/customers/api/customers.api";

export type Technician = {
  id: string;
  phone: string | null;
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

export const technicianKeys = {
  all: ["technicians"] as const,
};

export async function listTechnicians() {
  const result = await api<{ data: Technician[]; meta: PageMeta }>("/api/v1/technicians");
  return result.data;
}

export async function createTechnician(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}) {
  const result = await api<{ data: Technician }>("/api/v1/technicians", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}
