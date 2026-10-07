import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

// Scheduling rules (README section 4.6 assumptions, see docs/decisions/0002):
// a visit lasts durationMinutes (default 120), a technician cannot hold two visits that overlap,
// and cannot be booked inside recorded time off. Double booking is blocked, not warned.
export const DEFAULT_VISIT_MINUTES = 120;
const activeStatuses = ["SCHEDULED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] as const;

type Client = Prisma.TransactionClient | typeof prisma;

export async function findConflict(
  client: Client,
  input: { organizationId: string; technicianId: string; start: Date; durationMinutes: number; excludeVisitId?: string },
) {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const visits = await client.serviceVisit.findMany({
    where: {
      organizationId: input.organizationId,
      technicianId: input.technicianId,
      status: { in: [...activeStatuses] },
      scheduledStart: { lt: end, gte: new Date(input.start.getTime() - 24 * 60 * 60_000) },
      ...(input.excludeVisitId ? { NOT: { id: input.excludeVisitId } } : {}),
    },
    select: { id: true, scheduledStart: true, durationMinutes: true },
  });
  const overlapping = visits.find(
    (visit) => visit.scheduledStart.getTime() + visit.durationMinutes * 60_000 > input.start.getTime(),
  );
  if (overlapping) {
    return { kind: "VISIT" as const, id: overlapping.id };
  }
  const timeOff = await client.technicianTimeOff.findFirst({
    where: {
      organizationId: input.organizationId,
      technicianId: input.technicianId,
      startsAt: { lt: end },
      endsAt: { gt: input.start },
    },
    select: { id: true },
  });
  return timeOff ? { kind: "TIME_OFF" as const, id: timeOff.id } : null;
}

export async function assertTechnicianFree(
  client: Client,
  input: { organizationId: string; technicianId: string; start: Date; durationMinutes: number; excludeVisitId?: string },
) {
  const conflict = await findConflict(client, input);
  if (conflict) {
    throw new AppError(
      "SCHEDULE_CONFLICT",
      409,
      conflict.kind === "VISIT"
        ? "The technician already has a visit at that time"
        : "The technician is off at that time",
      conflict,
    );
  }
}
