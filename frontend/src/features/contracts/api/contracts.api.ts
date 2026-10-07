import { api } from "@/lib/apiClient";

export type Contract = {
  id: string;
  name: string;
  status: "ACTIVE" | "CANCELLED";
  startsOn: string;
  endsOn: string;
  serviceChargeCoveredPercent: number;
  labourCoveredPercent: number;
  partsCoveredPercent: number;
  includedVisits: number | null;
  usedVisits: number;
  customer: { id: string; name: string };
  assets: { asset: { id: string; equipmentType: string; serialNumber: string } }[];
  visits: { id: string; createdAt: string; workOrder: { id: string; asset: { equipmentType: string } } }[];
  maintenancePlans: { id: string; name: string; nextDueOn: string; isActive: boolean; intervalDays: number }[];
};

export type MaintenancePlan = {
  id: string;
  name: string;
  intervalDays: number;
  leadDays: number;
  nextDueOn: string;
  isActive: boolean;
  lastGeneratedAt: string | null;
  customer: { id: string; name: string };
  asset: { id: string; equipmentType: string; serialNumber: string };
  serviceType: { id: string; name: string };
  contract: { id: string; name: string } | null;
  workOrders: { id: string; status: string; createdAt: string; requestId: string }[];
};

export type ContractInput = {
  customerId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  assetIds: string[];
  includedVisits?: number;
  serviceChargeCoveredPercent: number;
  labourCoveredPercent: number;
  partsCoveredPercent: number;
};

export type PlanInput = {
  assetId: string;
  serviceTypeId: string;
  contractId?: string;
  name: string;
  intervalDays: number;
  leadDays: number;
  firstDueOn: string;
};

export const contractKeys = { contracts: ["contracts"] as const, plans: ["maintenance-plans"] as const };

export async function listContracts() {
  return (await api<{ data: Contract[] }>("/api/v1/contracts")).data;
}

export function createContract(input: ContractInput) {
  return api("/api/v1/contracts", { method: "POST", body: JSON.stringify(input) });
}

export function cancelContract(id: string, reason: string) {
  return api(`/api/v1/contracts/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function listPlans() {
  return (await api<{ data: MaintenancePlan[] }>("/api/v1/maintenance-plans")).data;
}

export function createPlan(input: PlanInput) {
  return api("/api/v1/maintenance-plans", { method: "POST", body: JSON.stringify(input) });
}

export function movePlan(id: string, action: "pause" | "resume") {
  return api(`/api/v1/maintenance-plans/${id}/${action}`, { method: "POST" });
}

export function runPlans() {
  return api<{ data: { workOrderId: string }[] }>("/api/v1/maintenance-plans/run", { method: "POST" });
}

export function visitsLabel(contract: Pick<Contract, "includedVisits" | "usedVisits">) {
  return contract.includedVisits === null
    ? `${contract.usedVisits} used · unlimited`
    : `${contract.usedVisits} of ${contract.includedVisits} used · ${Math.max(contract.includedVisits - contract.usedVisits, 0)} left`;
}

export function day(value: string) {
  return new Date(value).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}
