import { api, apiBlob } from "@/lib/apiClient";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID";

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  OVERDUE: "Overdue",
  PAID: "Paid",
  VOID: "Void",
};

export type InvoiceLine = {
  id: string;
  kind: "SERVICE_CHARGE" | "LABOUR" | "PART" | "ADDITIONAL";
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  coveredAmount: string;
  sacCode: string | null;
};

export type Payment = {
  id: string;
  amount: string;
  method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "ONLINE";
  reference: string | null;
  provider: string | null;
  paidAt: string;
  recordedBy: { id: string; name: string };
};

export type Invoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal: string;
  coveredTotal: string;
  discount: string;
  taxableAmount: string;
  taxRatePercent: string;
  cgst: string;
  sgst: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  coverageSource: "NONE" | "WARRANTY" | "CONTRACT";
  notes: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  contract: { id: string; name: string } | null;
  workOrder: {
    id: string;
    status: string;
    request: { id: string };
    asset: { id: string; equipmentType: string; serialNumber: string };
    serviceType: { id: string; name: string };
  };
  lines: InvoiceLine[];
  payments: Payment[];
};

export type InvoiceSummary = Pick<Invoice, "id" | "number" | "status" | "total" | "amountPaid" | "currency" | "dueAt" | "createdAt" | "customer"> & {
  workOrder: { id: string; asset: { equipmentType: string } };
};

export const invoiceKeys = {
  all: ["invoices"] as const,
  detail: (id: string) => ["invoices", id] as const,
};

export function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount));
}

export async function listInvoices() {
  return (await api<{ data: InvoiceSummary[] }>("/api/v1/invoices?limit=100")).data;
}

export async function getInvoice(id: string) {
  return (await api<{ data: Invoice }>(`/api/v1/invoices/${id}`)).data;
}

async function post(path: string, body?: unknown) {
  return (await api<{ data: Invoice }>(`/api/v1/invoices${path}`, { method: "POST", body: JSON.stringify(body ?? {}) })).data;
}

export const invoiceActions = {
  issue: (id: string) => post(`/${id}/issue`),
  addLine: (id: string, description: string, amount: string) => post(`/${id}/lines`, { description, amount }),
  discount: async (id: string, discount: string) =>
    (await api<{ data: Invoice }>(`/api/v1/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ discount }) })).data,
  recordPayment: (id: string, input: { amount: string; method: string; reference?: string }) => post(`/${id}/payments`, input),
  payOnline: (id: string) => post(`/${id}/pay`),
  void: (id: string, reason: string) => post(`/${id}/void`, { reason }),
};

export async function openServiceReport(workOrderId: string) {
  const blob = await apiBlob(`/api/v1/work-orders/${workOrderId}/report`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
