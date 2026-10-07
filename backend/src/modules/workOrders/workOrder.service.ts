import type { Prisma, RequestPriority } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { ListWorkOrdersQuery } from "./workOrder.schema.js";

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
    select: { id: true, scheduledStart: true, status: true },
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
  return { data: updated };
}

export async function scheduleWorkOrder(id: string, actor: AuthUser, input: { scheduledStart: string }) {
  const workOrder = await requireWorkOrder(id, actor);
  if (workOrder.status !== "ASSIGNED" || !workOrder.technicianId) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order cannot be scheduled");
  }
  if (await scheduledVisit(workOrder.id)) {
    throw new AppError("INVALID_TRANSITION", 409, "This work order already has a scheduled visit");
  }

  await prisma.serviceVisit.create({
    data: {
      organizationId: workOrder.organizationId,
      workOrderId: workOrder.id,
      technicianId: workOrder.technicianId,
      scheduledStart: new Date(input.scheduledStart),
      status: "SCHEDULED",
    },
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
    await tx.serviceVisit.updateMany({
      where: { workOrderId: workOrder.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    return tx.workOrder.update({
      where: { id: workOrder.id },
      data: { technicianId: null, status: "OPEN" },
      include: workOrderInclude,
    });
  });
  return { data: updated };
}
