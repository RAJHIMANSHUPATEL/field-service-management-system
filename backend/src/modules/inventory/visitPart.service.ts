import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getWorkOrder } from "../workOrders/workOrder.service.js";
import { applyMovement } from "./inventory.ledger.js";
import { requirePart, requireWarehouse } from "./inventory.service.js";
import type { AddVisitPartInput } from "./inventory.schema.js";
import { canMoveVisitPart, stockEffect, visitPartTransitions, type VisitPartAction } from "./visitPart.transitions.js";

// Parts are planned on arrival (reservation at diagnosis) and used once the work has started.
const actionStatuses: Record<VisitPartAction | "reserve", string[]> = {
  reserve: ["ARRIVED", "IN_PROGRESS"],
  release: ["ARRIVED", "IN_PROGRESS"],
  consume: ["IN_PROGRESS"],
  return: ["IN_PROGRESS"],
};

async function requireOwnVisit(id: string, actor: AuthUser, action: VisitPartAction | "reserve") {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { technician: { select: { userId: true } } },
  });
  if (!visit) {
    throw new AppError("VISIT_NOT_FOUND", 404, "Visit not found");
  }
  if (actor.role !== "TECHNICIAN" || visit.technician.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  if (!actionStatuses[action].includes(visit.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "Parts cannot change at this step of the visit");
  }
  return visit;
}

export async function addVisitPart(visitId: string, actor: AuthUser, input: AddVisitPartInput) {
  const visit = await requireOwnVisit(visitId, actor, "reserve");
  await prisma.$transaction(async (tx) => {
    const part = await requirePart(input.partId, actor, tx);
    const warehouse = input.warehouseId
      ? await requireWarehouse(input.warehouseId, actor, tx)
      : await tx.warehouse.findFirst({
          where: { organizationId: actor.organizationId, technicianId: visit.technicianId, isActive: true },
        });
    if (!warehouse) {
      throw new AppError("WAREHOUSE_NOT_FOUND", 404, "You have no van stock location; pick a warehouse");
    }
    const visitPart = await tx.visitPart.create({
      data: {
        organizationId: actor.organizationId,
        visitId: visit.id,
        partId: part.id,
        warehouseId: warehouse.id,
        quantity: input.quantity,
        unitPrice: part.unitPrice,
        currency: part.currency,
      },
    });
    await applyMovement(tx, {
      organizationId: actor.organizationId,
      warehouseId: warehouse.id,
      partId: part.id,
      kind: "RESERVED",
      onHandDelta: 0,
      reservedDelta: input.quantity,
      reason: "Reserved at diagnosis",
      actorId: actor.id,
      visitId: visit.id,
      visitPartId: visitPart.id,
    });
  });
  return getWorkOrder(visit.workOrderId, actor);
}

async function move(
  tx: Prisma.TransactionClient,
  visitPart: { id: string; organizationId: string; warehouseId: string; partId: string; quantity: number; visitId: string },
  action: VisitPartAction,
  actorId: string,
  reason: string,
) {
  const { from, to, kind } = visitPartTransitions[action];
  const moved = await tx.visitPart.updateMany({ where: { id: visitPart.id, status: from }, data: { status: to } });
  if (moved.count !== 1) {
    throw new AppError("INVALID_TRANSITION", 409, "This part cannot move to that step");
  }
  await applyMovement(tx, {
    organizationId: visitPart.organizationId,
    warehouseId: visitPart.warehouseId,
    partId: visitPart.partId,
    kind,
    ...stockEffect(action, visitPart.quantity),
    reason,
    actorId,
    visitId: visitPart.visitId,
    visitPartId: visitPart.id,
  });
}

const defaultReasons: Record<VisitPartAction, string> = {
  consume: "Used on the visit",
  release: "Not needed",
  return: "Returned unused",
};

export async function moveVisitPart(
  visitId: string,
  visitPartId: string,
  actor: AuthUser,
  action: VisitPartAction,
  reason?: string,
) {
  const visit = await requireOwnVisit(visitId, actor, action);
  const visitPart = await prisma.visitPart.findFirst({
    where: { id: visitPartId, visitId: visit.id, organizationId: actor.organizationId },
  });
  if (!visitPart) {
    throw new AppError("VISIT_PART_NOT_FOUND", 404, "Part not found on this visit");
  }
  if (!canMoveVisitPart(action, visitPart.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "This part cannot move to that step");
  }
  await prisma.$transaction((tx) => move(tx, visitPart, action, actor.id, reason ?? defaultReasons[action]));
  return getWorkOrder(visit.workOrderId, actor);
}

// On completion, reservations that were never used go back to available stock.
export async function releaseOpenReservations(tx: Prisma.TransactionClient, visitId: string, actorId: string) {
  const open = await tx.visitPart.findMany({ where: { visitId, status: "RESERVED" } });
  for (const visitPart of open) {
    await move(tx, visitPart, "release", actorId, "Visit completed without using it");
  }
}
