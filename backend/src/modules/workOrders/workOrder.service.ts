import type { Prisma, RequestPriority } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { assertTechnicianFree, DEFAULT_VISIT_MINUTES, findConflict } from "../visits/visit.scheduling.js";
import { canSchedule } from "./workOrder.transitions.js";
import type { ListWorkOrdersQuery, ReassignWorkOrderInput, ScheduleWorkOrderInput } from "./workOrder.schema.js";
import { jobEvent, notify } from "../notifications/notification.events.js";

function isAssignable(status: string) {
  return status === "OPEN" || status === "ASSIGNED";
}

const workOrderInclude = {
  customer: { select: { id: true, name: true } },
  asset: { select: { id: true, equipmentType: true, model: true, serialNumber: true } },
  address: { select: { id: true, label: true, line1: true, city: true, state: true, postalCode: true } },
  serviceType: { select: { id: true, name: true } },
  request: { select: { id: true, status: true, preferredStart: true, preferredEnd: true } },
  technician: { select: { id: true, user: { select: { id: true, name: true } } } },
  visits: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      scheduledStart: true,
      durationMinutes: true,
      status: true,
      enRouteAt: true,
      arrivedAt: true,
      startedAt: true,
      completedAt: true,
      endedAt: true,
      outcomeReason: true,
      diagnosis: true,
      workPerformed: true,
      signerName: true,
      signedAt: true,
      parts: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          quantity: true,
          status: true,
          unitPrice: true,
          currency: true,
          part: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      },
      photos: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, fileName: true, contentType: true, caption: true, createdAt: true },
      },
      technician: { select: { id: true, user: { select: { name: true } } } },
      changes: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          kind: true,
          fromStart: true,
          toStart: true,
          fromTechnicianId: true,
          toTechnicianId: true,
          reason: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      },
    },
  },
  invoice: { select: { id: true, number: true, status: true, total: true, currency: true } },
  feedback: { select: { id: true, rating: true, satisfied: true, comment: true, createdAt: true } },
  maintenancePlan: { select: { id: true, name: true, nextDueOn: true } },
  partRequests: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      quantity: true,
      status: true,
      note: true,
      createdAt: true,
      resolvedAt: true,
      part: { select: { id: true, sku: true, name: true } },
    },
  },
  notes: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  },
};

async function requireWorkOrder(id: string, actor: AuthUser) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { technician: { select: { userId: true } } },
  });
  if (!workOrder) {
    throw new AppError("WORK_ORDER_NOT_FOUND", 404, "Work order not found");
  }
  return workOrder;
}

function assertAssignedTechnician(userId: string | undefined, actor: AuthUser) {
  if (actor.role !== "TECHNICIAN" || userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
}

async function scheduledVisit(workOrderId: string) {
  return prisma.serviceVisit.findFirst({
    where: { workOrderId, status: "SCHEDULED" },
  });
}

export async function createOpenWorkOrder(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    requestId: string;
    customerId: string;
    assetId: string;
    addressId: string;
    serviceTypeId: string;
    priority: RequestPriority;
    description: string;
    maintenancePlanId?: string;
  },
) {
  return tx.workOrder.create({
    data: {
      organizationId: input.organizationId,
      requestId: input.requestId,
      customerId: input.customerId,
      assetId: input.assetId,
      addressId: input.addressId,
      serviceTypeId: input.serviceTypeId,
      priority: input.priority,
      description: input.description,
      maintenancePlanId: input.maintenancePlanId,
      status: "OPEN",
    },
  });
}

export async function listWorkOrders(actor: AuthUser, query: ListWorkOrdersQuery) {
  const where = {
    organizationId: actor.organizationId,
    ...(actor.role === "TECHNICIAN" ? { technician: { userId: actor.id } } : {}),
  };
  const [total, workOrders] = await Promise.all([
    prisma.workOrder.count({ where }),
    prisma.workOrder.findMany({
      where,
      include: workOrderInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: workOrders, meta: pageMeta(total, query.page, query.limit) };
}

export async function getWorkOrder(id: string, actor: AuthUser) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: workOrderInclude,
  });
  if (!workOrder) {
    throw new AppError("WORK_ORDER_NOT_FOUND", 404, "Work order not found");
  }
  if (actor.role === "TECHNICIAN" && workOrder.technician?.user.id !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  return { data: workOrder };
}

export async function assignWorkOrder(id: string, actor: AuthUser, input: { technicianId: string }) {
  const workOrder = await requireWorkOrder(id, actor);
  if (!isAssignable(workOrder.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be assigned");
  }
  if (await scheduledVisit(workOrder.id)) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be assigned");
  }

  const technician = await prisma.technician.findFirst({
    where: { id: input.technicianId, organizationId: actor.organizationId },
  });
  if (!technician) {
    throw new AppError("TECHNICIAN_NOT_FOUND", 404, "Technician not found");
  }
  if (!technician.isActive) {
    throw new AppError("TECHNICIAN_INACTIVE", 400, "This technician is inactive");
  }

  const updated = await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: { technicianId: technician.id, status: "ASSIGNED" },
    include: workOrderInclude,
  });
  await notify(() => jobEvent("job.assigned", workOrder.id));
  await notify(() => jobEvent("technician.assigned", workOrder.id));
  return { data: updated };
}

export async function scheduleWorkOrder(id: string, actor: AuthUser, input: ScheduleWorkOrderInput) {
  const workOrder = await requireWorkOrder(id, actor);
  if (!canSchedule(workOrder.status) || !workOrder.technicianId) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be scheduled");
  }
  if (await scheduledVisit(workOrder.id)) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order already has a scheduled visit");
  }

  const technicianId = workOrder.technicianId;
  const start = new Date(input.scheduledStart);
  const durationMinutes = input.durationMinutes ?? DEFAULT_VISIT_MINUTES;
  await prisma.$transaction(async (tx) => {
    await assertTechnicianFree(tx, { organizationId: actor.organizationId, technicianId, start, durationMinutes });
    const visit = await tx.serviceVisit.create({
      data: {
        organizationId: workOrder.organizationId,
        workOrderId: workOrder.id,
        technicianId,
        scheduledStart: start,
        durationMinutes,
        status: "SCHEDULED",
      },
    });
    await tx.visitChange.create({
      data: {
        organizationId: actor.organizationId,
        visitId: visit.id,
        actorId: actor.id,
        kind: "SCHEDULED",
        toStart: start,
        toTechnicianId: technicianId,
      },
    });
    // Visit two goes back to the technician to accept, like visit one.
    if (workOrder.status === "FOLLOW_UP_REQUIRED") {
      const moved = await tx.workOrder.updateMany({
        where: { id: workOrder.id, organizationId: actor.organizationId, status: "FOLLOW_UP_REQUIRED" },
        data: { status: "ASSIGNED" },
      });
      if (moved.count !== 1) {
        throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be scheduled");
      }
    }
  });

  return getWorkOrder(id, actor);
}

export async function acceptWorkOrder(id: string, actor: AuthUser) {
  const workOrder = await requireWorkOrder(id, actor);
  assertAssignedTechnician(workOrder.technician?.userId, actor);
  if (workOrder.status !== "ASSIGNED") {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be accepted");
  }
  if (!(await scheduledVisit(workOrder.id))) {
    throw new AppError("INVALID_TRANSITION", 409, "Schedule a visit before accepting this work order");
  }

  const updated = await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: { status: "ACCEPTED" },
    include: workOrderInclude,
  });
  const visit = await scheduledVisit(workOrder.id);
  await notify(() => jobEvent("appointment.confirmed", workOrder.id, { at: visit?.scheduledStart }));
  return { data: updated };
}

export async function declineWorkOrder(id: string, actor: AuthUser, reason: string) {
  const workOrder = await requireWorkOrder(id, actor);
  assertAssignedTechnician(workOrder.technician?.userId, actor);
  if (workOrder.status !== "ASSIGNED") {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be declined");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.workOrderNote.create({
      data: {
        organizationId: workOrder.organizationId,
        workOrderId: workOrder.id,
        authorId: actor.id,
        body: reason,
      },
    });
    const scheduled = await tx.serviceVisit.findMany({ where: { workOrderId: workOrder.id, status: "SCHEDULED" } });
    for (const visit of scheduled) {
      await tx.serviceVisit.update({ where: { id: visit.id }, data: { status: "CANCELLED" } });
      await tx.visitChange.create({
        data: {
          organizationId: actor.organizationId,
          visitId: visit.id,
          actorId: actor.id,
          kind: "CANCELLED",
          fromStart: visit.scheduledStart,
          fromTechnicianId: visit.technicianId,
          reason: `Declined: ${reason}`,
        },
      });
    }
    return tx.workOrder.update({
      where: { id: workOrder.id },
      data: { technicianId: null, status: "OPEN" },
      include: workOrderInclude,
    });
  });
  const declinedBy = (await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name;
  await notify(() => jobEvent("assignment.declined", workOrder.id, { vars: { technician: declinedBy, reason } }));
  return { data: updated };
}

// Moves a job that already has a technician to another one. The new technician must accept again,
// so the job returns to ASSIGNED, and a scheduled visit moves with it and records the change.
export async function reassignWorkOrder(id: string, actor: AuthUser, input: ReassignWorkOrderInput) {
  const workOrder = await requireWorkOrder(id, actor);
  if ((workOrder.status !== "ASSIGNED" && workOrder.status !== "ACCEPTED") || !workOrder.technicianId) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be reassigned");
  }
  if (workOrder.technicianId === input.technicianId) {
    throw new AppError("INVALID_TRANSITION", 409, "This technician already has the job");
  }
  const technician = await prisma.technician.findFirst({
    where: { id: input.technicianId, organizationId: actor.organizationId },
  });
  if (!technician) {
    throw new AppError("TECHNICIAN_NOT_FOUND", 404, "Technician not found");
  }
  if (!technician.isActive) {
    throw new AppError("TECHNICIAN_INACTIVE", 400, "This technician is inactive");
  }
  const fromTechnicianId = workOrder.technicianId;
  await prisma.$transaction(async (tx) => {
    const visit = await tx.serviceVisit.findFirst({ where: { workOrderId: workOrder.id, status: "SCHEDULED" } });
    if (visit) {
      await assertTechnicianFree(tx, {
        organizationId: actor.organizationId,
        technicianId: technician.id,
        start: visit.scheduledStart,
        durationMinutes: visit.durationMinutes,
        excludeVisitId: visit.id,
      });
      await tx.serviceVisit.update({ where: { id: visit.id }, data: { technicianId: technician.id } });
      await tx.visitChange.create({
        data: {
          organizationId: actor.organizationId,
          visitId: visit.id,
          actorId: actor.id,
          kind: "REASSIGNED",
          fromTechnicianId,
          toTechnicianId: technician.id,
          reason: input.reason,
        },
      });
    }
    await tx.workOrderNote.create({
      data: {
        organizationId: actor.organizationId,
        workOrderId: workOrder.id,
        authorId: actor.id,
        body: `Reassigned: ${input.reason}`,
      },
    });
    const moved = await tx.workOrder.updateMany({
      where: { id: workOrder.id, organizationId: actor.organizationId, status: workOrder.status },
      data: { technicianId: technician.id, status: "ASSIGNED" },
    });
    if (moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This work order changed; reload and try again");
    }
  });
  await notify(() => jobEvent("assignment.changed", workOrder.id, { technicianIds: [fromTechnicianId], vars: { reason: input.reason } }));
  await notify(() => jobEvent("job.assigned", workOrder.id));
  await notify(() => jobEvent("technician.assigned", workOrder.id));
  return getWorkOrder(id, actor);
}

// Explainable assignment score out of 100 (README section 4.9). Skill 40, service area 30,
// workload 30 minus 10 per open job. Availability at the requested time is reported, not scored.
export async function technicianCandidates(id: string, actor: AuthUser, at?: string) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { serviceType: true, address: true },
  });
  if (!workOrder) {
    throw new AppError("WORK_ORDER_NOT_FOUND", 404, "Work order not found");
  }
  const technicians = await prisma.technician.findMany({
    where: { organizationId: actor.organizationId, isActive: true },
    include: {
      user: { select: { name: true } },
      skills: { select: { skillId: true } },
      serviceAreas: { select: { serviceArea: { select: { postalCodes: true, isActive: true } } } },
      _count: { select: { workOrders: { where: { status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "AWAITING_PARTS", "FOLLOW_UP_REQUIRED"] } } } } },
    },
  });
  const start = at ? new Date(at) : null;
  const rows = await Promise.all(
    technicians.map(async (technician) => {
      const requiredSkillId = workOrder.serviceType.requiredSkillId;
      const hasSkill = !requiredSkillId || technician.skills.some((skill) => skill.skillId === requiredSkillId);
      const inArea = technician.serviceAreas.some(
        (link) => link.serviceArea.isActive && link.serviceArea.postalCodes.includes(workOrder.address.postalCode),
      );
      const openJobs = technician._count.workOrders;
      const breakdown = {
        skill: hasSkill ? 40 : 0,
        area: inArea ? 30 : 0,
        workload: Math.max(0, 30 - openJobs * 10),
      };
      const conflict = start
        ? await findConflict(prisma, {
            organizationId: actor.organizationId,
            technicianId: technician.id,
            start,
            durationMinutes: DEFAULT_VISIT_MINUTES,
          })
        : null;
      return {
        technicianId: technician.id,
        name: technician.user.name,
        score: breakdown.skill + breakdown.area + breakdown.workload,
        breakdown,
        openJobs,
        hasSkill,
        inArea,
        available: conflict === null,
      };
    }),
  );
  rows.sort(
    (a, b) => Number(b.available) - Number(a.available) || b.score - a.score || a.name.localeCompare(b.name),
  );
  return { data: rows };
}

export async function addNote(id: string, actor: AuthUser, body: string) {
  const workOrder = await requireWorkOrder(id, actor);
  if (actor.role === "TECHNICIAN") {
    assertAssignedTechnician(workOrder.technician?.userId, actor);
  }
  await prisma.workOrderNote.create({
    data: { organizationId: actor.organizationId, workOrderId: workOrder.id, authorId: actor.id, body },
  });
  return getWorkOrder(workOrder.id, actor);
}
