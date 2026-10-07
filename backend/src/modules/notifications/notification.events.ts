import { prisma } from "../../lib/prisma.js";
import { emit, type EmitInput } from "./notification.service.js";
import type { NotificationEvent } from "./notification.catalog.js";

function when(value: Date | null | undefined) {
  return value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : undefined;
}

// Builds the shared context for a job event: who the customer and technician are, the wording
// variables, and where each audience should land.
export async function jobEvent(
  event: NotificationEvent,
  workOrderId: string,
  extra: { vars?: EmitInput["vars"]; technicianIds?: (string | null | undefined)[]; at?: Date | null } = {},
) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      customer: { select: { name: true } },
      asset: { select: { equipmentType: true } },
      technician: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!workOrder) {
    return [];
  }
  return emit(event, {
    organizationId: workOrder.organizationId,
    customerId: workOrder.customerId,
    technicianIds: extra.technicianIds ?? [workOrder.technicianId],
    vars: {
      customer: workOrder.customer.name,
      equipment: workOrder.asset.equipmentType,
      technician: workOrder.technician?.user.name,
      when: when(extra.at),
      ...extra.vars,
    },
    links: { CUSTOMER: `/requests/${workOrder.requestId}`, TECHNICIAN: `/work-orders/${workOrder.id}`, OPS: `/work-orders/${workOrder.id}` },
    entityType: "WorkOrder",
    entityId: workOrder.id,
  });
}

export async function requestEvent(event: NotificationEvent, requestId: string) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { customer: { select: { name: true } }, asset: { select: { equipmentType: true } } },
  });
  if (!request) {
    return [];
  }
  return emit(event, {
    organizationId: request.organizationId,
    customerId: request.customerId,
    vars: { customer: request.customer.name, equipment: request.asset.equipmentType },
    links: { CUSTOMER: `/requests/${request.id}`, OPS: `/requests/${request.id}` },
    entityType: "ServiceRequest",
    entityId: request.id,
  });
}

export async function invoiceEvent(event: NotificationEvent, invoiceId: string, amount?: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return [];
  }
  const format = (value: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: invoice.currency }).format(Number(value));
  return emit(event, {
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    vars: { invoiceNumber: invoice.number, amount: format(amount ?? invoice.total.toString()) },
    links: { CUSTOMER: `/invoices/${invoice.id}` },
    entityType: "Invoice",
    entityId: invoice.id,
  });
}

// Fires once each time a location drops to its reorder level; restocking re-arms it.
export async function checkLowStock(warehouseId: string, partId: string) {
  const level = await prisma.stockLevel.findUnique({
    where: { warehouseId_partId: { warehouseId, partId } },
    include: { part: true, warehouse: true },
  });
  if (!level || level.part.reorderLevel <= 0 || level.onHand - level.reserved > level.part.reorderLevel) {
    return [];
  }
  const restocks = await prisma.stockMovement.count({
    where: { warehouseId, partId, kind: { in: ["RECEIVED", "TRANSFER_IN", "RETURNED"] } },
  });
  return emit("inventory.low", {
    organizationId: level.organizationId,
    vars: { part: `${level.part.name} (${level.part.sku})`, location: level.warehouse.name, available: level.onHand - level.reserved },
    link: "/inventory",
    entityType: "StockLevel",
    entityId: level.id,
    dedupeKey: `low:${level.id}:${restocks}`,
  });
}

// Time-based events, run by the worker on a timer and on demand by an admin.
export async function runSweeps(now = new Date(), organizationId?: string) {
  const org = organizationId ? { organizationId } : {};
  const late = await prisma.serviceVisit.findMany({
    where: { ...org, status: "SCHEDULED", scheduledStart: { lt: new Date(now.getTime() - 30 * 60_000) }, workOrder: { status: "ACCEPTED" } },
    include: { workOrder: { select: { id: true } } },
  });
  let fired = 0;
  for (const visit of late) {
    const workOrder = await prisma.workOrder.findUniqueOrThrow({
      where: { id: visit.workOrderId },
      include: { customer: { select: { name: true } } },
    });
    const ids = await emit("job.delayed", {
      organizationId: visit.organizationId,
      vars: { customer: workOrder.customer.name, when: when(visit.scheduledStart) },
      link: `/work-orders/${visit.workOrderId}`,
      entityType: "ServiceVisit",
      entityId: visit.id,
      dedupeKey: `delayed:${visit.id}`,
    });
    fired += ids.length;
  }
  const expiring = await prisma.serviceContract.findMany({
    where: { ...org, status: "ACTIVE", endsOn: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) } },
    include: { customer: { select: { name: true } } },
  });
  for (const contract of expiring) {
    const ids = await emit("contract.expiring", {
      organizationId: contract.organizationId,
      vars: { contract: contract.name, customer: contract.customer.name, when: contract.endsOn.toISOString().slice(0, 10) },
      link: "/contracts",
      entityType: "ServiceContract",
      entityId: contract.id,
      dedupeKey: `expiring:${contract.id}`,
    });
    fired += ids.length;
  }
  return fired;
}

// Callers notify after their transaction commits. The state change has already happened, so a
// notification failure is logged loudly instead of turning the response into an error.
export async function notify(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.error("[notifications] could not record notification", error);
  }
}
