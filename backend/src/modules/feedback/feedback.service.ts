import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateFeedbackInput } from "./feedback.schema.js";

const select = {
  id: true,
  rating: true,
  satisfied: true,
  comment: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
  workOrder: {
    select: {
      id: true,
      requestId: true,
      customer: { select: { id: true, name: true } },
      asset: { select: { equipmentType: true } },
      technician: { select: { id: true, user: { select: { name: true } } } },
    },
  },
};

// The customer rates a completed job once; feedback is a record, not an editable document.
export async function createFeedback(workOrderId: string, actor: AuthUser, input: CreateFeedbackInput) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, organizationId: actor.organizationId },
    include: { feedback: { select: { id: true } } },
  });
  const contact = await prisma.customerContact.findUnique({ where: { userId: actor.id } });
  if (!workOrder || !contact || contact.customerId !== workOrder.customerId) {
    throw new AppError("WORK_ORDER_NOT_FOUND", 404, "Work order not found");
  }
  if (workOrder.status !== "COMPLETED") {
    throw new AppError("INVALID_TRANSITION", 409, "You can rate a job once it is completed");
  }
  if (workOrder.feedback) {
    throw new AppError("FEEDBACK_EXISTS", 409, "You already rated this job");
  }
  const created = await prisma.feedback.create({
    data: { organizationId: actor.organizationId, workOrderId: workOrder.id, authorId: actor.id, ...input },
    select,
  });
  return { data: created };
}

export async function listFeedback(actor: AuthUser, query: { technicianId?: string }) {
  const where = {
    organizationId: actor.organizationId,
    ...(query.technicianId ? { workOrder: { technicianId: query.technicianId } } : {}),
  };
  const [rows, stats] = await Promise.all([
    prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select }),
    prisma.feedback.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const satisfied = await prisma.feedback.count({ where: { ...where, satisfied: true } });
  const count = stats._count._all;
  return {
    data: rows,
    meta: {
      count,
      averageRating: stats._avg.rating === null ? null : Math.round(stats._avg.rating * 100) / 100,
      satisfiedPercent: count === 0 ? null : Math.round((satisfied / count) * 100),
    },
  };
}
