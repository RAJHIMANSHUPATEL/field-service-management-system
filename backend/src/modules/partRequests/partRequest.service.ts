import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { partsArrivedTransition } from "../workOrders/workOrder.transitions.js";
import type { ListPartRequestsQuery } from "./partRequest.schema.js";
import { partRequestTransitions, type PartRequestAction } from "./partRequest.transitions.js";

const select = {
  id: true,
  quantity: true,
  status: true,
  note: true,
  createdAt: true,
  resolvedAt: true,
  part: { select: { id: true, sku: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  workOrder: { select: { id: true, status: true, customer: { select: { id: true, name: true } } } },
};

export async function listPartRequests(actor: AuthUser, query: ListPartRequestsQuery) {
  const rows = await prisma.partRequest.findMany({
    where: { organizationId: actor.organizationId, ...(query.status ? { status: query.status } : {}) },
    orderBy: { createdAt: "asc" },
    select,
  });
  return { data: rows };
}

// Resolving the last open request on a job that waits for parts makes it ready for visit two.
export async function resolvePartRequest(id: string, actor: AuthUser, action: PartRequestAction, note?: string) {
  const { from, to } = partRequestTransitions[action];
  const request = await prisma.partRequest.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!request) {
    throw new AppError("PART_REQUEST_NOT_FOUND", 404, "Part request not found");
  }
  await prisma.$transaction(async (tx) => {
    const moved = await tx.partRequest.updateMany({
      where: { id: request.id, status: from },
      data: { status: to, resolvedAt: new Date(), ...(note ? { note } : {}) },
    });
    if (moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This part request is already resolved");
    }
    const stillOpen = await tx.partRequest.count({ where: { workOrderId: request.workOrderId, status: "OPEN" } });
    if (stillOpen === 0) {
      const ready = await tx.workOrder.updateMany({
        where: { id: request.workOrderId, organizationId: actor.organizationId, status: partsArrivedTransition.from },
        data: { status: partsArrivedTransition.to },
      });
      if (ready.count === 1) {
        await tx.workOrderNote.create({
          data: {
            organizationId: actor.organizationId,
            workOrderId: request.workOrderId,
            authorId: actor.id,
            body: "All requested parts are resolved; the job is ready for a follow-up visit.",
          },
        });
      }
    }
  });
  return { data: await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id }, select }) };
}
