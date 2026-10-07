import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, scheduledJob, seedStaff, setup, type Setup } from "../../test/jobFixtures.js";
import { technicianMetrics } from "./analytics.formulas.js";

const api = (path: string) => `/api/v1${path}`;
const signature = {
  signerName: "Owner",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function onSite(token: string, visitId: string) {
  for (const step of ["en-route", "arrive", "start"]) {
    expect((await request(app).post(api(`/visits/${visitId}/${step}`)).set(auth(token))).status).toBe(200);
  }
}

async function finish(token: string, visitId: string, minutes: number) {
  await request(app).patch(api(`/visits/${visitId}/report`)).set(auth(token)).send({ workPerformed: "Done" });
  await request(app).post(api(`/visits/${visitId}/signature`)).set(auth(token)).send(signature);
  expect((await request(app).post(api(`/visits/${visitId}/complete`)).set(auth(token))).status).toBe(200);
  // Pin the times so service-time arithmetic is exact.
  const completedAt = new Date(Date.now() - 60 * 60_000);
  await prisma.serviceVisit.update({ where: { id: visitId }, data: { completedAt, startedAt: new Date(completedAt.getTime() - minutes * 60_000) } });
}

async function scenario(context: Setup) {
  const tara = await login("tara@example.com");
  const sam = await login("sam@example.com");
  // A: fixed on the first visit in 60 minutes, rated 5.
  const a = await scheduledJob(context, "tara", "2026-11-03T08:00:00.000Z");
  await onSite(tara, a.visitId);
  await request(app).post(api(`/visits/${a.visitId}/parts`)).set(auth(tara)).send({ partId: (await partId(context)), quantity: 2 });
  const parts = await prisma.visitPart.findMany({ where: { visitId: a.visitId } });
  await request(app).post(api(`/visits/${a.visitId}/parts/${parts[0]!.id}/consume`)).set(auth(tara));
  await finish(tara, a.visitId, 60);
  // B: needs a second visit, fixed in 30 minutes, rated 3.
  const b = await scheduledJob(context, "tara", "2026-11-03T11:00:00.000Z");
  await onSite(tara, b.visitId);
  await request(app).post(api(`/visits/${b.visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "FOLLOW_UP_REQUIRED", reason: "Needs a second look", partRequests: [] });
  const again = await request(app).post(api(`/work-orders/${b.workOrderId}/schedule`)).set(auth(context.opsToken)).send({ scheduledStart: "2026-11-04T09:00:00.000Z" });
  const second = again.body.data.visits.at(-1).id as string;
  await request(app).post(api(`/work-orders/${b.workOrderId}/accept`)).set(auth(tara));
  await onSite(tara, second);
  await finish(tara, second, 30);
  for (const [job, rating] of [[a, 5], [b, 3]] as const) {
    expect((await request(app).post(api(`/work-orders/${job.workOrderId}/feedback`)).set(auth(context.ownerToken)).send({ rating, satisfied: rating > 3 })).status).toBe(201);
  }
  // C: pending with tara and late to start. D: sam's visit cancelled. E: unassigned.
  const c = await scheduledJob(context, "tara", "2026-11-05T09:00:00.000Z");
  await prisma.serviceVisit.update({ where: { id: c.visitId }, data: { scheduledStart: new Date(Date.now() - 2 * 3_600_000) } });
  const d = await scheduledJob(context, "sam", "2026-11-05T09:00:00.000Z");
  await request(app).post(api(`/visits/${d.visitId}/cancel`)).set(auth(context.opsToken)).send({ reason: "Customer away" });
  await context.workOrder();
  // A's invoice issued and unpaid; B's left as a draft.
  const invoiceA = await prisma.invoice.findUniqueOrThrow({ where: { workOrderId: a.workOrderId } });
  await request(app).post(api(`/invoices/${invoiceA.id}/issue`)).set(auth(context.opsToken));
  return { a, b, c, d, tara, sam };
}

let cachedPart: string | undefined;
async function partId(context: Setup) {
  if (cachedPart && (await prisma.part.findUnique({ where: { id: cachedPart } }))) {
    return cachedPart;
  }
  const part = await request(app).post(api("/parts")).set(auth(context.opsToken)).send({ sku: "filter", name: "Filter", unitPrice: "100.00" });
  const van = await request(app).post(api("/warehouses")).set(auth(context.opsToken)).send({ name: "Van", kind: "VAN", technicianId: context.technicians.tara });
  await request(app).post(api("/inventory/receipts")).set(auth(context.opsToken)).send({ warehouseId: van.body.data.id, partId: part.body.data.id, quantity: 10, reason: "Stock" });
  cachedPart = part.body.data.id as string;
  return cachedPart;
}

describe("metric formulas", () => {
  it("computes first-visit resolution, repeats, service and completion time, rating", () => {
    const at = (hours: number) => new Date(Date.UTC(2026, 10, 1) + hours * 3_600_000);
    const metrics = technicianMetrics({
      completedJobs: [
        { workOrderId: "a", technicianId: "t", createdAt: at(0), completedAt: at(10), onSiteVisits: 1, rating: 5 },
        { workOrderId: "b", technicianId: "t", createdAt: at(0), completedAt: at(30), onSiteVisits: 2, rating: null },
        { workOrderId: "c", technicianId: "t", createdAt: at(0), completedAt: at(20), onSiteVisits: 1, rating: 4 },
      ],
      serviceVisits: [
        { technicianId: "t", startedAt: at(9), completedAt: at(10) },
        { technicianId: "t", startedAt: at(29.5), completedAt: at(30) },
      ],
      pendingJobs: 2,
      cancelledVisits: 1,
      partsConsumed: 3,
    });
    expect(metrics).toEqual({
      jobsCompleted: 3,
      jobsPending: 2,
      firstVisitResolutionPercent: 67,
      repeatVisitJobs: 1,
      averageServiceMinutes: 45,
      averageCompletionHours: 20,
      averageRating: 4.5,
      ratings: 2,
      cancelledVisits: 1,
      partsConsumed: 3,
    });
    expect(technicianMetrics({ completedJobs: [], serviceVisits: [], pendingJobs: 0, cancelledVisits: 0, partsConsumed: 0 })).toMatchObject({
      firstVisitResolutionPercent: null,
      averageServiceMinutes: null,
      averageRating: null,
    });
  });
});

describe("analytics reconcile with raw data", () => {
  it("technician performance matches the underlying records", async () => {
    const context = await setup();
    const { a, b } = await scenario(context);
    const window = `from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${new Date(Date.now() + 86_400_000).toISOString()}`;
    const response = await request(app).get(api(`/analytics/technicians?${window}`)).set(auth(context.opsToken));
    expect(response.status).toBe(200);
    const tara = response.body.data.find((row: { technician: { name: string } }) => row.technician.name === "tara");
    const sam = response.body.data.find((row: { technician: { name: string } }) => row.technician.name === "sam");

    // Raw: completion = work order created → completing visit, averaged.
    const completions = await prisma.serviceVisit.findMany({
      where: { workOrderId: { in: [a.workOrderId, b.workOrderId] }, status: "COMPLETED" },
      include: { workOrder: true },
    });
    const hours = completions.map((visit) => (visit.completedAt!.getTime() - visit.workOrder.createdAt.getTime()) / 3_600_000);
    expect(tara).toMatchObject({
      jobsCompleted: 2,
      jobsPending: 1,
      firstVisitResolutionPercent: 50,
      repeatVisitJobs: 1,
      averageServiceMinutes: 45,
      averageCompletionHours: Math.round(((hours[0]! + hours[1]!) / 2) * 10) / 10,
      averageRating: 4,
      ratings: 2,
      cancelledVisits: 0,
      partsConsumed: 2,
    });
    expect(sam).toMatchObject({ jobsCompleted: 0, jobsPending: 1, cancelledVisits: 1, firstVisitResolutionPercent: null });
    expect(response.body.meta.team).toMatchObject({ jobsCompleted: 2, jobsPending: 2, cancelledVisits: 1 });

    // Raw cross-checks straight from the tables.
    expect(await prisma.workOrder.count({ where: { status: "COMPLETED" } })).toBe(tara.jobsCompleted + sam.jobsCompleted);
    const consumed = await prisma.stockMovement.aggregate({ where: { kind: "CONSUMED" }, _sum: { onHandDelta: true } });
    expect(-(consumed._sum.onHandDelta ?? 0)).toBe(tara.partsConsumed);
    expect((await prisma.feedback.aggregate({ _avg: { rating: true } }))._avg.rating).toBe(tara.averageRating);

    // Outside the window nothing counts.
    const old = await request(app).get(api("/analytics/technicians?from=2020-01-01T00:00:00.000Z&to=2020-02-01T00:00:00.000Z")).set(auth(context.opsToken));
    expect(old.body.meta.team).toMatchObject({ jobsCompleted: 0, cancelledVisits: 0, partsConsumed: 0 });
  });

  it("the dashboard matches counts taken from the tables", async () => {
    const context = await setup();
    const { c } = await scenario(context);
    const response = await request(app).get(api("/analytics/dashboard")).set(auth(context.opsToken));
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.activeJobs.total).toBe(await prisma.workOrder.count({ where: { status: { in: ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "AWAITING_PARTS", "FOLLOW_UP_REQUIRED"] } } }));
    expect(data.activeJobs.byStatus).toMatchObject({ ACCEPTED: 1, ASSIGNED: 1 });
    expect(data.unassignedQueue.count).toBe(await prisma.workOrder.count({ where: { status: "OPEN" } }));
    expect(data.unassignedQueue.count).toBe(1);
    expect(data.delayedVisits.count).toBe(1);
    expect(data.delayedVisits.items[0].workOrderId).toBe(c.workOrderId);
    const open = await prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "OVERDUE"] } } });
    expect(data.pendingInvoices).toMatchObject({ count: 1, drafts: 1, overdue: 0 });
    expect(data.pendingInvoices.outstanding).toBe(open[0]!.total.sub(open[0]!.amountPaid).toFixed(2));
    expect(data.completedJobs).toBe(2);
  });

  it("is for the office only and validates the period", async () => {
    const context = await setup();
    const tara = await login("tara@example.com");
    expect((await request(app).get(api("/analytics/dashboard")).set(auth(tara))).status).toBe(403);
    expect((await request(app).get(api("/analytics/technicians")).set(auth(context.ownerToken))).status).toBe(403);
    expect((await request(app).get(api("/analytics/dashboard"))).status).toBe(401);
    const bad = await request(app).get(api("/analytics/technicians?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z")).set(auth(context.opsToken));
    expect(bad.status).toBe(400);
    // Other organisations' data never appears.
    const other = await prisma.organization.create({ data: { name: "Other" } });
    await prisma.workOrder.count();
    const otherOps = await prisma.user.create({
      data: { organizationId: other.id, email: "o@other.com", name: "O", role: "OPS", passwordHash: (await prisma.user.findFirstOrThrow({ where: { email: "ops@example.com" } })).passwordHash },
    });
    await context.workOrder();
    const theirs = await request(app).get(api("/analytics/dashboard")).set(auth(await login(otherOps.email)));
    expect(theirs.body.data.unassignedQueue.count).toBe(0);
  });
});
