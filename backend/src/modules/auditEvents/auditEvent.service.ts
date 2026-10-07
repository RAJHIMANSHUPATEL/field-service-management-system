import type { AuthUser } from "../../types/authUser.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { ListAuditEventsQuery } from "./auditEvent.schema.js";

export async function listAuditEvents(actor: AuthUser, query: ListAuditEventsQuery) {
  const where = {
    organizationId: actor.organizationId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
  };
  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { data: events, meta: pageMeta(total, query.page, query.limit) };
}
