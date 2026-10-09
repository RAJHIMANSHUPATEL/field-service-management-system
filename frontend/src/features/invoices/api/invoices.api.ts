import type { z } from "zod";
import { api, apiBlob } from "@/lib/apiClient";
import { paymentOptionsSchema, type invoiceStatusSchema } from "../schemas/invoice.schema";

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

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

// A credit note (CN-…) or a refund (RF-…).
export type Adjustment = {
  id: string;
  number: string;
  amount: string;
  currency: string;
  reason: string;
  createdAt: string;
  createdBy: { id: string; name: string };
};

// Computed by the API from one definition (backend invoice.balance.ts):
// owed = (total - credits) - (payments - refunds); balance = owed when positive, refundDue when negative.
export type Settlement = {
  netTotal: string;
  netPaid: string;
  balance: string;
  refundDue: string;
  creditable: string;
  refundable: string;
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
  // Inter-state supply: the whole tax is IGST and CGST/SGST are 0; intra-state: IGST is 0.
  igst: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  creditedTotal: string;
  refundedTotal: string;
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
  creditNotes: Adjustment[];
  refunds: Adjustment[];
  settlement: Settlement;
};

export type InvoiceSummary = Pick<Invoice, "id" | "number" | "status" | "total" | "amountPaid" | "currency" | "dueAt" | "createdAt" | "customer" | "settlement"> & {
  workOrder: { id: string; asset: { equipmentType: string } };
};

export const invoiceKeys = {
  all: ["invoices"] as const,
  detail: (id: string) => ["invoices", id] as const,
  // Outside "invoices" so invoice mutations do not refetch it.
  paymentOptions: ["invoice-payment-options"] as const,
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

export async function getPaymentOptions() {
  return paymentOptionsSchema.parse((await api<{ data: unknown }>("/api/v1/invoices/payment-options")).data);
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
  creditNote: (id: string, input: { amount: string; reason: string }) => post(`/${id}/credit-notes`, input),
  refund: (id: string, input: { amount: string; reason: string }) => post(`/${id}/refunds`, input),
};

// Downloads the invoice PDF through the authenticated client (a bare link would carry no token).
export async function downloadInvoicePdf(invoiceId: string, number: string | null) {
  const blob = await apiBlob(`/api/v1/invoices/${invoiceId}/pdf`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${number ?? invoiceId}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openServiceReport(workOrderId: string) {
  const blob = await apiBlob(`/api/v1/work-orders/${workOrderId}/report`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
