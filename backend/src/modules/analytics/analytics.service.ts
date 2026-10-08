import { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { prisma } from "../../lib/prisma.js";
import { settlementOf } from "../invoices/invoice.balance.js";
import { activeStatuses, DELAY_MINUTES, technicianMetrics, type CompletedJob } from "./analytics.formulas.js";

const Decimal = Prisma.Decimal;

export function period(query: { from?: string; to?: string }, now = new Date()) {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

// A live snapshot of the operation. Every number has a list or filter behind it in the API.
export async function dashboard(actor: AuthUser, now = new Date()) {
  const organizationId = actor.organizationId;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [byStatus, unassigned, triage, delayed, today, invoices, drafts] = await Promise.all([
    prisma.workOrder.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.workOrder.findMany({
      where: { organizationId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, priority: true, customer: { select: { name: true } }, asset: { select: { equipmentType: true } } },
    }),
    prisma.serviceRequest.count({ where: { organizationId, status: { in: ["SUBMITTED", "NEEDS_INFO"] } } }),
    prisma.serviceVisit.findMany({
      where: {
        organizationId,
        status: "SCHEDULED",
        scheduledStart: { lt: new Date(now.getTime() - DELAY_MINUTES * 60_000) },
        workOrder: { status: { in: ["ACCEPTED", "ASSIGNED"] } },
      },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true,
        scheduledStart: true,
        workOrderId: true,
        technician: { select: { user: { select: { name: true } } } },
        workOrder: { select: { customer: { select: { name: true } } } },
      },
    }),
    prisma.serviceVisit.count({
      where: { organizationId, status: { not: "CANCELLED" }, scheduledStart: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["ISSUED", "OVERDUE", "PAID"] } },
      select: { status: true, total: true, creditedTotal: true, amountPaid: true, refundedTotal: true, currency: true },
    }),
    prisma.invoice.count({ where: { organizationId, status: "DRAFT" } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
  // Balances after credit notes and refunds (invoice.balance.ts). Paid invoices are read only for
  // money the customer is owed back after a credit.
  const pending = invoices.filter((row) => row.status !== "PAID");
  const figures = invoices.map((row) => settlementOf(row));
  const outstanding = figures.reduce((sum, row) => sum.add(row.balance), new Decimal(0));
  const refundDue = figures.reduce((sum, row) => sum.add(row.refundDue), new Decimal(0));
  return {
    data: {
      generatedAt: now.toISOString(),
      activeJobs: {
        total: activeStatuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
        byStatus: Object.fromEntries(activeStatuses.map((status) => [status, counts[status] ?? 0])),
      },
      delayedVisits: {
        count: delayed.length,
        rule: `Scheduled visits not started ${DELAY_MINUTES} minutes after their start time`,
        items: delayed.slice(0, 20).map((row) => ({
          visitId: row.id,
          workOrderId: row.workOrderId,
          scheduledStart: row.scheduledStart,
          technician: row.technician.user.name,
          customer: row.workOrder.customer.name,
        })),
      },
      unassignedQueue: {
        count: unassigned.length,
        oldestCreatedAt: unassigned[0]?.createdAt ?? null,
        awaitingTriage: triage,
        items: unassigned.slice(0, 20).map((row) => ({
          workOrderId: row.id,
          createdAt: row.createdAt,
          priority: row.priority,
          customer: row.customer.name,
          equipment: row.asset.equipmentType,
        })),
      },
      pendingInvoices: {
        count: pending.length,
        overdue: pending.filter((row) => row.status === "OVERDUE").length,
        drafts,
        outstanding: outstanding.toFixed(2),
        refundDue: refundDue.toFixed(2),
        refundDueCount: figures.filter((row) => row.refundDue.gt(0)).length,
        currency: invoices[0]?.currency ?? "INR",
      },
      visitsToday: today,
      completedJobs: counts.COMPLETED ?? 0,
    },
  };
}

// Rows for the period; a job belongs to the technician of the visit that completed it.
async function completedJobs(organizationId: string, from: Date, to: Date) {
  const visits = await prisma.serviceVisit.findMany({
    where: { organizationId, status: "COMPLETED", completedAt: { gte: from, lt: to } },
    select: {
      technicianId: true,
      completedAt: true,
      startedAt: true,
      workOrder: {
        select: {
          id: true,
          createdAt: true,
          feedback: { select: { rating: true } },
          visits: { where: { arrivedAt: { not: null } }, select: { id: true } },
        },
      },
    },
  });
  const jobs: CompletedJob[] = visits.map((visit) => ({
    workOrderId: visit.workOrder.id,
    technicianId: visit.technicianId,
    createdAt: visit.workOrder.createdAt,
    completedAt: visit.completedAt!,
    onSiteVisits: visit.workOrder.visits.length,
    rating: visit.workOrder.feedback?.rating ?? null,
  }));
  const serviceVisits = visits
    .filter((visit) => visit.startedAt)
    .map((visit) => ({ technicianId: visit.technicianId, startedAt: visit.startedAt!, completedAt: visit.completedAt! }));
  return { jobs, serviceVisits };
}

export async function technicianPerformance(actor: AuthUser, query: { from?: string; to?: string }) {
  const organizationId = actor.organizationId;
  const { from, to } = period(query);
  const [technicians, completed, pending, cancelled, consumed] = await Promise.all([
    prisma.technician.findMany({
      where: { organizationId },
      orderBy: { user: { name: "asc" } },
      select: { id: true, isActive: true, user: { select: { name: true } } },
    }),
    completedJobs(organizationId, from, to),
    prisma.workOrder.groupBy({
      by: ["technicianId"],
      where: { organizationId, status: { in: [...activeStatuses] }, technicianId: { not: null } },
      _count: { _all: true },
    }),
    prisma.visitChange.groupBy({
      by: ["fromTechnicianId"],
      where: { organizationId, kind: "CANCELLED", createdAt: { gte: from, lt: to }, fromTechnicianId: { not: null } },
      _count: { _all: true },
    }),
    prisma.stockMovement.findMany({
      where: { organizationId, kind: "CONSUMED", createdAt: { gte: from, lt: to }, visitId: { not: null } },
      select: { onHandDelta: true, visitId: true },
    }),
  ]);
  const visitTechnician = new Map(
    (
      await prisma.serviceVisit.findMany({
        where: { id: { in: [...new Set(consumed.map((row) => row.visitId!))] } },
        select: { id: true, technicianId: true },
      })
    ).map((row) => [row.id, row.technicianId]),
  );
  const rows = technicians.map((technician) => ({
    technician: { id: technician.id, name: technician.user.name, isActive: technician.isActive },
    ...technicianMetrics({
      completedJobs: completed.jobs.filter((job) => job.technicianId === technician.id),
      serviceVisits: completed.serviceVisits.filter((visit) => visit.technicianId === technician.id),
      pendingJobs: pending.find((row) => row.technicianId === technician.id)?._count._all ?? 0,
      cancelledVisits: cancelled.find((row) => row.fromTechnicianId === technician.id)?._count._all ?? 0,
      partsConsumed: consumed
        .filter((row) => visitTechnician.get(row.visitId!) === technician.id)
        .reduce((sum, row) => sum - row.onHandDelta, 0),
    }),
  }));
  return {
    data: rows,
    meta: {
      from: from.toISOString(),
      to: to.toISOString(),
      team: technicianMetrics({
        completedJobs: completed.jobs,
        serviceVisits: completed.serviceVisits,
        pendingJobs: pending.reduce((sum, row) => sum + row._count._all, 0),
        cancelledVisits: cancelled.reduce((sum, row) => sum + row._count._all, 0),
        partsConsumed: consumed.reduce((sum, row) => sum - row.onHandDelta, 0),
      }),
    },
  };
}
