import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getWorkOrder } from "../workOrders/workOrder.service.js";
import { canMoveVisit, visitTransitions, type VisitStep } from "./visit.transitions.js";

async function requireVisit(id: string, actor: AuthUser) {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      technician: { select: { userId: true } },
      workOrder: { select: { id: true, status: true } },
    },
  });
  if (!visit) {
    throw new AppError("VISIT_NOT_FOUND", 404, "Visit not found");
  }
  return visit;
}

export async function moveVisit(id: string, actor: AuthUser, step: VisitStep) {
  const visit = await requireVisit(id, actor);
  if (actor.role !== "TECHNICIAN" || visit.technician.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }

  const { from, to } = visitTransitions[step];
  // The work order stays ACCEPTED until the visit starts.
  if (!canMoveVisit(step, visit.status) || visit.workOrder.status !== "ACCEPTED") {
    throw new AppError("INVALID_TRANSITION", 409, "This visit cannot move to that step");
  }

  await prisma.$transaction(async (tx) => {
    const moved = await tx.serviceVisit.updateMany({
      where: { id: visit.id, organizationId: actor.organizationId, status: from },
      data: { status: to },
    });
    if (moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This visit cannot move to that step");
    }
    if (step === "start") {
      await tx.workOrder.updateMany({
        where: { id: visit.workOrder.id, organizationId: actor.organizationId, status: "ACCEPTED" },
        data: { status: "IN_PROGRESS" },
      });
    }
  });

  return getWorkOrder(visit.workOrder.id, actor);
}
