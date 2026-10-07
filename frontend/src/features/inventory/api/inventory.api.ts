import { api } from "@/lib/apiClient";

export type StockLevel = {
  id: string;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: string;
  warehouse: { id: string; name: string; kind: "WAREHOUSE" | "VAN" };
  part: { id: string; sku: string; name: string; unitPrice: string; currency: string };
};

export type MovementKind =
  | "RECEIVED"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "RESERVED"
  | "RELEASED"
  | "CONSUMED"
  | "RETURNED"
  | "ADJUSTED";

export type StockMovement = {
  id: string;
  kind: MovementKind;
  onHandDelta: number;
  reservedDelta: number;
  reason: string;
  visitId: string | null;
  createdAt: string;
  warehouse: { id: string; name: string };
  part: { id: string; sku: string; name: string };
  actor: { id: string; name: string };
};

export const movementLabels: Record<MovementKind, string> = {
  RECEIVED: "Received",
  TRANSFER_OUT: "Transferred out",
  TRANSFER_IN: "Transferred in",
  RESERVED: "Reserved",
  RELEASED: "Released",
  CONSUMED: "Used",
  RETURNED: "Returned",
  ADJUSTED: "Adjusted",
};

export const inventoryKeys = {
  stock: ["inventory", "stock"] as const,
  movements: ["inventory", "movements"] as const,
};

export async function listStock() {
  return (await api<{ data: StockLevel[] }>("/api/v1/inventory/stock")).data;
}

export async function listMovements() {
  return (await api<{ data: StockMovement[] }>("/api/v1/inventory/movements?limit=100")).data;
}

export type StockAction =
  | { kind: "receipts"; warehouseId: string; partId: string; quantity: number; reason: string }
  | { kind: "transfers"; fromWarehouseId: string; toWarehouseId: string; partId: string; quantity: number; reason: string }
  | { kind: "adjustments"; warehouseId: string; partId: string; quantityDelta: number; reason: string };

export async function recordStock({ kind, ...input }: StockAction) {
  return api<{ data: unknown }>(`/api/v1/inventory/${kind}`, { method: "POST", body: JSON.stringify(input) });
}
