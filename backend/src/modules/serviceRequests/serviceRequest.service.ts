import type { ServiceRequestStatus } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { createOpenWorkOrder } from "../workOrders/workOrder.service.js";
import {
  toDate,
  type AcceptServiceRequestInput,
  type CreateServiceRequestInput,
  type ListServiceRequestsQuery,
} from "./serviceRequest.schema.js";

const requestInclude = {
  customer: { select: { id: true, name: true } },
  asset: { select: { id: true, equipmentType: true, model: true, serialNumber: true } },
  address: {
    select: { id: true, label: true, line1: true, city: true, state: true, postalCode: true },
  },
  serviceType: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  notes: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
  workOrder: { select: { id: true, status: true } },
};

const openStatuses: ServiceRequestStatus[] = ["SUBMITTED", "NEEDS_INFO"];

async function linkedContact(userId: string) {
  return prisma.customerContact.findUnique({
    where: { userId },
    select: { id: true, customerId: true },
  });
}

function assertOpen(status: ServiceRequestStatus) {
  if (status !== "SUBMITTED" && status !== "NEEDS_INFO") {
    throw new AppError("INVALID_TRANSITION", 409, "This request can no longer be changed");
  }
}

async function requireRequest(id: string, actor: AuthUser) {
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: requestInclude,
  });
  if (!serviceRequest) {
    throw new AppError("REQUEST_NOT_FOUND", 404, "Service request not found");
  }
  if (actor.role === "CUSTOMER") {
    const contact = await linkedContact(actor.id);
    if (!contact || contact.customerId !== serviceRequest.customerId) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
    }
  }
  return serviceRequest;
}

export async function listServiceRequests(actor: AuthUser, query: ListServiceRequestsQuery) {
  const contact = actor.role === "CUSTOMER" ? await linkedContact(actor.id) : undefined;
  const where = {
    organizationId: actor.organizationId,
    ...(actor.role === "CUSTOMER" ? { customerId: contact?.customerId ?? "__none__" } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.open === "true" && !query.status ? { status: { in: openStatuses } } : {}),
  };

  const [total, requests] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: requests, meta: pageMeta(total, query.page, query.limit) };
}

export async function getServiceRequest(id: string, actor: AuthUser) {
  return { data: await requireRequest(id, actor) };
}

export async function createServiceRequest(input: CreateServiceRequestInput, actor: AuthUser) {
  if (actor.role === "CUSTOMER" && input.priority !== undefined) {
    throw new AppError("FORBIDDEN", 403, "You cannot set priority");
  }

  const start = toDate(input.preferredStart);
  const end = toDate(input.preferredEnd);
  if (end < start) {
    throw new AppError("INVALID_WINDOW", 400, "The preferred end date must be on or after the start date");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: actor.organizationId },
  });
  if (!asset) {
    throw new AppError("ASSET_NOT_FOUND", 404, "Asset not found");
  }

  const contact = actor.role === "CUSTOMER" ? await linkedContact(actor.id) : undefined;
  if (actor.role === "CUSTOMER" && contact?.customerId !== asset.customerId) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }

  const serviceType = await prisma.serviceType.findFirst({
    where: { id: input.serviceTypeId, organizationId: actor.organizationId },
  });
  if (!serviceType) {
    throw new AppError("SERVICE_TYPE_NOT_FOUND", 404, "Service type not found");
  }
  if (!serviceType.isActive) {
    throw new AppError("SERVICE_TYPE_INACTIVE", 400, "Choose an active service type");
  }

  const created = await prisma.serviceRequest.create({
    data: {
      organizationId: actor.organizationId,
      customerId: asset.customerId,
      contactId: contact?.id,
      assetId: asset.id,
      addressId: asset.addressId,
      serviceTypeId: serviceType.id,
      description: input.description,
      preferredStart: start,
      preferredEnd: end,
      priority: input.priority ?? "NORMAL",
    },
    include: requestInclude,
  });

  return { data: created };
}

export async function acceptServiceRequest(id: string, input: AcceptServiceRequestInput, actor: AuthUser) {
  const current = await requireRequest(id, actor);
  assertOpen(current.status);

  const priority = input.priority ?? current.priority;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequestNote.create({
      data: {
        requestId: id,
        authorId: actor.id,
        body: input.note ?? "Accepted",
      },
    });
    await tx.serviceRequest.update({
      where: { id },
      data: { status: "ACCEPTED", priority },
    });
    await createOpenWorkOrder(tx, {
      organizationId: current.organizationId,
      requestId: id,
      customerId: current.customerId,
      assetId: current.assetId,
      addressId: current.addressId,
      serviceTypeId: current.serviceTypeId,
      priority,
      description: current.description,
    });
    return tx.serviceRequest.findFirstOrThrow({
      where: { id },
      include: requestInclude,
    });
  });

  return { data: updated };
}

export async function rejectServiceRequest(id: string, reason: string, actor: AuthUser) {
  const current = await requireRequest(id, actor);
  assertOpen(current.status);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequestNote.create({
      data: { requestId: id, authorId: actor.id, body: reason },
    });
    return tx.serviceRequest.update({
      where: { id },
      data: { status: "REJECTED" },
      include: requestInclude,
    });
  });
  return { data: updated };
}

export async function requestInfo(id: string, message: string, actor: AuthUser) {
  const current = await requireRequest(id, actor);
  assertOpen(current.status);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequestNote.create({
      data: { requestId: id, authorId: actor.id, body: message },
    });
    return tx.serviceRequest.update({
      where: { id },
      data: { status: "NEEDS_INFO" },
      include: requestInclude,
    });
  });
  return { data: updated };
}

export async function replyToRequest(id: string, message: string, actor: AuthUser) {
  const current = await requireRequest(id, actor);
  if (current.status !== "NEEDS_INFO") {
    throw new AppError("INVALID_TRANSITION", 409, "A reply is only accepted while more information was requested");
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceRequestNote.create({
      data: { requestId: id, authorId: actor.id, body: message },
    });
    return tx.serviceRequest.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: requestInclude,
    });
  });
  return { data: updated };
}
