import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requirePart } from "../inventory/inventory.service.js";
import { releaseOpenReservations } from "../inventory/visitPart.service.js";
import { getWorkOrder } from "../workOrders/workOrder.service.js";
import type { UnsuccessfulVisitInput } from "./visit.schema.js";
import { unsuccessfulFrom } from "./visit.transitions.js";
import { jobEvent, notify } from "../notifications/notification.events.js";

const outcomeLabels = {
  AWAITING_PARTS: "Awaiting parts",
  FOLLOW_UP_REQUIRED: "Follow-up required",
} as const;

// The technician ends a visit that could not finish. The work order stays open in the outcome
// status; parts that were reserved but not used go back to stock.
export async function endUnsuccessful(id: string, actor: AuthUser, input: UnsuccessfulVisitInput) {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { technician: { select: { userId: true } }, workOrder: { select: { id: true, status: true } } },
  });
  if (!visit) {
    throw new AppError("VISIT_NOT_FOUND", 404, "Visit not found");
  }
  if (actor.role !== "TECHNICIAN" || visit.technician.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  const workOrderFrom = visit.status === "IN_PROGRESS" ? "IN_PROGRESS" : "ACCEPTED";
  if (!unsuccessfulFrom.includes(visit.status) || visit.workOrder.status !== workOrderFrom) {
    throw new AppError("INVALID_TRANSITION", 409, "Only a visit on site can end unsuccessfully");
  }
  if (input.outcome === "AWAITING_PARTS" && input.partRequests.length === 0) {
    throw new AppError("VALIDATION_ERROR", 400, "Say which parts are needed", { field: "partRequests" });
  }

  await prisma.$transaction(async (tx) => {
    for (const request of input.partRequests) {
      await requirePart(request.partId, actor, tx);
    }
    const ended = await tx.serviceVisit.updateMany({
      where: { id: visit.id, status: visit.status },
      data: { status: "UNSUCCESSFUL", endedAt: new Date(), outcomeReason: input.reason },
    });
    const moved = await tx.workOrder.updateMany({
      where: { id: visit.workOrder.id, organizationId: actor.organizationId, status: workOrderFrom },
      data: { status: input.outcome },
    });
    if (ended.count !== 1 || moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "Only a visit on site can end unsuccessfully");
    }
    await releaseOpenReservations(tx, visit.id, actor.id);
    for (const request of input.partRequests) {
      await tx.partRequest.create({
        data: {
          organizationId: actor.organizationId,
          workOrderId: visit.workOrder.id,
          visitId: visit.id,
          partId: request.partId,
          quantity: request.quantity,
          note: request.note,
          requestedById: actor.id,
        },
      });
    }
    await tx.workOrderNote.create({
      data: {
        organizationId: actor.organizationId,
        workOrderId: visit.workOrder.id,
        authorId: actor.id,
        body: `Visit ended without finishing (${outcomeLabels[input.outcome]}): ${input.reason}`,
      },
    });
  });
  const workOrderId = visit.workOrder.id;
  await notify(() => jobEvent("job.another_visit", workOrderId, { vars: { reason: input.reason } }));
  if (input.outcome === "AWAITING_PARTS") {
    const parts = await prisma.part.findMany({ where: { id: { in: input.partRequests.map((row) => row.partId) } } });
    const wanted = input.partRequests
      .map((row) => `${row.quantity} × ${parts.find((part) => part.id === row.partId)?.name ?? "part"}`)
      .join(", ");
    await notify(() => jobEvent("part.unavailable", workOrderId, { vars: { parts: wanted } }));
  } else {
    await notify(() => jobEvent("follow_up.required", workOrderId));
  }
  return getWorkOrder(visit.workOrder.id, actor);
}
