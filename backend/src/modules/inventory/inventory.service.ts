import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { applyMovement } from "./inventory.ledger.js";
import type { AdjustmentInput, MovementQuery, ReceiptInput, StockQuery, TransferInput } from "./inventory.schema.js";
import { checkLowStock, notify } from "../notifications/notification.events.js";

const levelSelect = {
  id: true,
  onHand: true,
  reserved: true,
  updatedAt: true,
  warehouse: { select: { id: true, name: true, kind: true } },
  part: { select: { id: true, sku: true, name: true, unitPrice: true, currency: true } },
};

const movementSelect = {
  id: true,
  kind: true,
  onHandDelta: true,
  reservedDelta: true,
  reason: true,
  visitId: true,
  transferGroup: true,
  createdAt: true,
  warehouse: { select: { id: true, name: true } },
  part: { select: { id: true, sku: true, name: true } },
  actor: { select: { id: true, name: true } },
};

export async function requireWarehouse(id: string, actor: AuthUser, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const warehouse = await client.warehouse.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!warehouse) {
    throw new AppError("WAREHOUSE_NOT_FOUND", 404, "Warehouse not found");
  }
  if (!warehouse.isActive) {
    throw new AppError("INVALID_TRANSITION", 409, "This location is inactive");
  }
  return warehouse;
}

export async function requirePart(id: string, actor: AuthUser, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const part = await client.part.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!part) {
    throw new AppError("PART_NOT_FOUND", 404, "Part not found");
  }
  if (!part.isActive) {
    throw new AppError("INVALID_TRANSITION", 409, "This part is inactive");
  }
  return part;
}

// Technicians only see their own van.
async function technicianScope(actor: AuthUser) {
  if (actor.role !== "TECHNICIAN") {
    return {};
  }
  return { warehouse: { technician: { userId: actor.id } } };
}

export async function listStock(actor: AuthUser, query: StockQuery) {
  const levels = await prisma.stockLevel.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.partId ? { partId: query.partId } : {}),
      ...(await technicianScope(actor)),
    },
    orderBy: [{ warehouse: { name: "asc" } }, { part: { sku: "asc" } }],
    select: levelSelect,
  });
  return { data: levels.map((level) => ({ ...level, available: level.onHand - level.reserved })) };
}

export async function listMovements(actor: AuthUser, query: MovementQuery) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.partId ? { partId: query.partId } : {}),
      ...(query.visitId ? { visitId: query.visitId } : {}),
      ...(await technicianScope(actor)),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit,
    select: movementSelect,
  });
  return { data: movements };
}

export async function receive(actor: AuthUser, input: ReceiptInput) {
  const movement = await prisma.$transaction(async (tx) => {
    await requireWarehouse(input.warehouseId, actor, tx);
    await requirePart(input.partId, actor, tx);
    return applyMovement(tx, {
      organizationId: actor.organizationId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      kind: "RECEIVED",
      onHandDelta: input.quantity,
      reason: input.reason,
      actorId: actor.id,
    });
  });
  return { data: await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, select: movementSelect }) };
}

export async function transfer(actor: AuthUser, input: TransferInput) {
  const transferGroup = randomUUID();
  await prisma.$transaction(async (tx) => {
    await requireWarehouse(input.fromWarehouseId, actor, tx);
    await requireWarehouse(input.toWarehouseId, actor, tx);
    await requirePart(input.partId, actor, tx);
    const base = { organizationId: actor.organizationId, partId: input.partId, reason: input.reason, actorId: actor.id, transferGroup };
    await applyMovement(tx, { ...base, warehouseId: input.fromWarehouseId, kind: "TRANSFER_OUT", onHandDelta: -input.quantity });
    await applyMovement(tx, { ...base, warehouseId: input.toWarehouseId, kind: "TRANSFER_IN", onHandDelta: input.quantity });
  });
  await notify(() => checkLowStock(input.fromWarehouseId, input.partId));
  return {
    data: await prisma.stockMovement.findMany({
      where: { organizationId: actor.organizationId, transferGroup },
      orderBy: { createdAt: "asc" },
      select: movementSelect,
    }),
  };
}

export async function adjust(actor: AuthUser, input: AdjustmentInput) {
  const movement = await prisma.$transaction(async (tx) => {
    await requireWarehouse(input.warehouseId, actor, tx);
    await requirePart(input.partId, actor, tx);
    return applyMovement(tx, {
      organizationId: actor.organizationId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      kind: "ADJUSTED",
      onHandDelta: input.quantityDelta,
      reason: input.reason,
      actorId: actor.id,
    });
  });
  await notify(() => checkLowStock(input.warehouseId, input.partId));
  return { data: await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, select: movementSelect }) };
}
