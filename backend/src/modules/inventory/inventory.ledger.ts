import type { Prisma, StockMovementKind } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";

export type Movement = {
  organizationId: string;
  warehouseId: string;
  partId: string;
  kind: StockMovementKind;
  onHandDelta: number;
  reservedDelta?: number;
  reason: string;
  actorId: string;
  visitId?: string;
  visitPartId?: string;
  transferGroup?: string;
};

// What a movement would leave behind; null when it would break the stock rules.
export function nextLevel(current: { onHand: number; reserved: number }, onHandDelta: number, reservedDelta: number) {
  const onHand = current.onHand + onHandDelta;
  const reserved = current.reserved + reservedDelta;
  if (onHand < 0 || reserved < 0 || reserved > onHand) {
    return null;
  }
  return { onHand, reserved };
}

// The only way stock changes: lock the level row, check the rules, update it, append a ledger row.
export async function applyMovement(tx: Prisma.TransactionClient, movement: Movement) {
  const reservedDelta = movement.reservedDelta ?? 0;
  await tx.stockLevel.upsert({
    where: { warehouseId_partId: { warehouseId: movement.warehouseId, partId: movement.partId } },
    create: { organizationId: movement.organizationId, warehouseId: movement.warehouseId, partId: movement.partId },
    update: {},
  });
  const [level] = await tx.$queryRaw<{ id: string; onHand: number; reserved: number }[]>`
    SELECT "id", "onHand", "reserved" FROM "StockLevel"
    WHERE "warehouseId" = ${movement.warehouseId} AND "partId" = ${movement.partId}
    FOR UPDATE`;
  const next = nextLevel(level!, movement.onHandDelta, reservedDelta);
  if (!next) {
    throw new AppError("INSUFFICIENT_STOCK", 409, "Not enough stock at this location", {
      warehouseId: movement.warehouseId,
      partId: movement.partId,
      onHand: level!.onHand,
      reserved: level!.reserved,
      available: level!.onHand - level!.reserved,
    });
  }
  await tx.stockLevel.update({ where: { id: level!.id }, data: next });
  return tx.stockMovement.create({
    data: {
      organizationId: movement.organizationId,
      warehouseId: movement.warehouseId,
      partId: movement.partId,
      kind: movement.kind,
      onHandDelta: movement.onHandDelta,
      reservedDelta,
      reason: movement.reason,
      actorId: movement.actorId,
      visitId: movement.visitId,
      visitPartId: movement.visitPartId,
      transferGroup: movement.transferGroup,
    },
  });
}
