import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getWorkOrder } from "../workOrders/workOrder.service.js";
import { canMoveVisit, canReplan, stepTimestamp, visitTransitions, type VisitStep } from "./visit.transitions.js";
import { assertTechnicianFree } from "./visit.scheduling.js";
import type { CalendarQuery, RescheduleVisitInput } from "./visit.schema.js";

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
  // The work order stays ACCEPTED until the visit starts, then IN_PROGRESS until completion.
  const workOrderFrom = step === "complete" ? "IN_PROGRESS" : "ACCEPTED";
  if (!canMoveVisit(step, visit.status) || visit.workOrder.status !== workOrderFrom) {
    throw new AppError("INVALID_TRANSITION", 409, "This visit cannot move to that step");
  }
  if (step === "complete") {
    const missing = [
      ...(visit.workPerformed ? [] : ["workPerformed"]),
      ...(visit.signatureKey ? [] : ["signature"]),
    ];
    if (missing.length > 0) {
      throw new AppError("INVALID_TRANSITION", 409, "Record the work performed and the customer signature first", {
        missing,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const moved = await tx.serviceVisit.updateMany({
      where: { id: visit.id, organizationId: actor.organizationId, status: from },
      data: { status: to, [stepTimestamp[step]]: new Date() },
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
    if (step === "complete") {
      const completed = await tx.workOrder.updateMany({
        where: { id: visit.workOrder.id, organizationId: actor.organizationId, status: "IN_PROGRESS" },
        data: { status: "COMPLETED" },
      });
      if (completed.count !== 1) {
        throw new AppError("INVALID_TRANSITION", 409, "This visit cannot move to that step");
      }
    }
  });

  return getWorkOrder(visit.workOrder.id, actor);
}

export async function rescheduleVisit(id: string, actor: AuthUser, input: RescheduleVisitInput) {
  const visit = await requireVisit(id, actor);
  if (!canReplan(visit.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "Only a scheduled visit can be rescheduled");
  }
  const start = new Date(input.scheduledStart);
  const durationMinutes = input.durationMinutes ?? visit.durationMinutes;
  await prisma.$transaction(async (tx) => {
    await assertTechnicianFree(tx, {
      organizationId: actor.organizationId,
      technicianId: visit.technicianId,
      start,
      durationMinutes,
      excludeVisitId: visit.id,
    });
    const moved = await tx.serviceVisit.updateMany({
      where: { id: visit.id, organizationId: actor.organizationId, status: "SCHEDULED" },
      data: { scheduledStart: start, durationMinutes },
    });
    if (moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "Only a scheduled visit can be rescheduled");
    }
    await tx.visitChange.create({
      data: {
        organizationId: actor.organizationId,
        visitId: visit.id,
        actorId: actor.id,
        kind: "RESCHEDULED",
        fromStart: visit.scheduledStart,
        toStart: start,
        fromTechnicianId: visit.technicianId,
        toTechnicianId: visit.technicianId,
        reason: input.reason,
      },
    });
  });
  return getWorkOrder(visit.workOrder.id, actor);
}

// Cancelling the planned visit sends an accepted job back to ASSIGNED: ops schedules a new time
// and the technician accepts that time.
export async function cancelVisit(id: string, actor: AuthUser, reason: string) {
  const visit = await requireVisit(id, actor);
  if (!canReplan(visit.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "Only a scheduled visit can be cancelled");
  }
  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.serviceVisit.updateMany({
      where: { id: visit.id, organizationId: actor.organizationId, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "Only a scheduled visit can be cancelled");
    }
    await tx.visitChange.create({
      data: {
        organizationId: actor.organizationId,
        visitId: visit.id,
        actorId: actor.id,
        kind: "CANCELLED",
        fromStart: visit.scheduledStart,
        fromTechnicianId: visit.technicianId,
        reason,
      },
    });
    await tx.workOrder.updateMany({
      where: { id: visit.workOrder.id, organizationId: actor.organizationId, status: "ACCEPTED" },
      data: { status: "ASSIGNED" },
    });
  });
  return getWorkOrder(visit.workOrder.id, actor);
}

export async function listCalendar(actor: AuthUser, query: CalendarQuery) {
  const ownTechnician =
    actor.role === "TECHNICIAN"
      ? await prisma.technician.findFirst({ where: { userId: actor.id, organizationId: actor.organizationId } })
      : null;
  const technicianId = actor.role === "TECHNICIAN" ? (ownTechnician?.id ?? "__none__") : query.technicianId;
  const from = new Date(query.from);
  const to = new Date(query.to);
  const [visits, timeOff] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: {
        organizationId: actor.organizationId,
        scheduledStart: { gte: from, lt: to },
        status: { not: "CANCELLED" },
        ...(technicianId ? { technicianId } : {}),
      },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true,
        scheduledStart: true,
        durationMinutes: true,
        status: true,
        technician: { select: { id: true, user: { select: { name: true } } } },
        workOrder: {
          select: {
            id: true,
            status: true,
            customer: { select: { name: true } },
            asset: { select: { equipmentType: true } },
            address: { select: { city: true, postalCode: true } },
          },
        },
      },
    }),
    prisma.technicianTimeOff.findMany({
      where: {
        organizationId: actor.organizationId,
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(technicianId ? { technicianId } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        technician: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
  ]);
  return { data: { visits, timeOff } };
}
