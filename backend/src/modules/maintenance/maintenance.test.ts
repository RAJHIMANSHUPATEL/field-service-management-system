import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, seedStaff, setup, type Setup } from "../../test/jobFixtures.js";
import { generateDue } from "./maintenance.service.js";
import { isDue, nextDueAfter } from "./maintenance.transitions.js";

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

async function arrange(context: Setup, includedVisits?: number) {
  const ops = context.opsToken;
  const customer = await prisma.customer.findFirstOrThrow({ where: { name: "Owner Co" } });
  const address = await prisma.address.findFirstOrThrow({ where: { customerId: customer.id } });
  const serviceType = await prisma.serviceType.findFirstOrThrow({ where: { name: "Repair" } });
  await request(app)
    .patch(api(`/service-types/${serviceType.id}`))
    .set(auth(ops))
    .send({ serviceCharge: "500.00", labourRatePerHour: "1000.00" });
  const asset = await request(app).post(api("/assets")).set(auth(ops)).send({
    customerId: customer.id,
    addressId: address.id,
    equipmentType: "Chiller",
    model: "C1",
    serialNumber: `PM-${Math.random()}`,
  });
  const contract = await request(app).post(api("/contracts")).set(auth(ops)).send({
    customerId: customer.id,
    name: "AMC",
    startsOn: "2026-01-01",
    endsOn: "2027-12-31",
    assetIds: [asset.body.data.id],
    includedVisits,
  });
  expect(contract.status).toBe(201);
  const plan = await request(app).post(api("/maintenance-plans")).set(auth(ops)).send({
    assetId: asset.body.data.id,
    serviceTypeId: serviceType.id,
    contractId: contract.body.data.id,
    name: "Quarterly service",
    intervalDays: 90,
    leadDays: 3,
    firstDueOn: "2026-11-10",
  });
  expect(plan.status).toBe(201);
  return { assetId: asset.body.data.id as string, contractId: contract.body.data.id as string, planId: plan.body.data.id as string, serviceTypeId: serviceType.id };
}

let hour = 6;
async function complete(context: Setup, workOrderId: string) {
  hour += 2;
  const ops = context.opsToken;
  await request(app).post(api(`/work-orders/${workOrderId}/assign`)).set(auth(ops)).send({ technicianId: context.technicians.tara });
  const scheduled = await request(app)
    .post(api(`/work-orders/${workOrderId}/schedule`))
    .set(auth(ops))
    .send({ scheduledStart: `2026-11-0${Math.floor(hour / 24) + 3}T${String(hour % 24).padStart(2, "0")}:00:00.000Z` });
  expect(scheduled.status).toBe(200);
  const visitId = scheduled.body.data.visits.at(-1).id as string;
  const tara = await login("tara@example.com");
  await request(app).post(api(`/work-orders/${workOrderId}/accept`)).set(auth(tara));
  for (const step of ["en-route", "arrive", "start"]) {
    await request(app).post(api(`/visits/${visitId}/${step}`)).set(auth(tara));
  }
  await request(app).patch(api(`/visits/${visitId}/report`)).set(auth(tara)).send({ workPerformed: "Serviced" });
  await request(app).post(api(`/visits/${visitId}/signature`)).set(auth(tara)).send(signature);
  const done = await request(app).post(api(`/visits/${visitId}/complete`)).set(auth(tara));
  expect(done.status).toBe(200);
  return done.body.data;
}

describe("maintenance plan rules", () => {
  it("is due from leadDays before the due date and moves forward from the completion day", () => {
    const plan = { isActive: true, nextDueOn: new Date("2026-11-10T00:00:00Z"), leadDays: 3 };
    expect(isDue(plan, new Date("2026-11-06T23:59:00Z"))).toBe(false);
    expect(isDue(plan, new Date("2026-11-07T00:00:00Z"))).toBe(true);
    expect(isDue({ ...plan, isActive: false }, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(nextDueAfter(new Date("2026-11-08T17:30:00Z"), 90).toISOString()).toBe("2027-02-06T00:00:00.000Z");
  });
});

describe("preventive maintenance", () => {
  it("opens a work order when due, once, and schedules the next occurrence on completion", async () => {
    const context = await setup();
    const { planId, contractId } = await arrange(context, 2);
    expect(await generateDue(new Date("2026-11-06T12:00:00Z"))).toEqual([]);
    const generated = await generateDue(new Date("2026-11-07T08:00:00Z"));
    expect(generated).toHaveLength(1);
    expect(await generateDue(new Date("2026-11-07T09:00:00Z"))).toEqual([]);

    const workOrder = await request(app).get(api(`/work-orders/${generated[0]!.workOrderId}`)).set(auth(context.opsToken));
    expect(workOrder.body.data).toMatchObject({
      status: "OPEN",
      description: "Preventive maintenance: Quarterly service",
      maintenancePlan: { id: planId, name: "Quarterly service" },
      request: { status: "ACCEPTED" },
    });

    const done = await complete(context, generated[0]!.workOrderId);
    expect(done.invoice).toMatchObject({ status: "DRAFT", total: "0" });
    const contract = await request(app).get(api(`/contracts/${contractId}`)).set(auth(context.opsToken));
    expect(contract.body.data).toMatchObject({ includedVisits: 2, usedVisits: 1 });
    expect(contract.body.data.visits.map((row: { workOrder: { id: string } }) => row.workOrder.id)).toEqual([generated[0]!.workOrderId]);
    const plan = await request(app).get(api(`/maintenance-plans/${planId}`)).set(auth(context.opsToken));
    const completedOn = new Date();
    expect(plan.body.data.nextDueOn).toBe(nextDueAfter(completedOn, 90).toISOString());

    const nextRun = new Date(new Date(plan.body.data.nextDueOn as string).getTime() - 3 * 86_400_000);
    expect(await generateDue(new Date(nextRun.getTime() - 1))).toEqual([]);
    expect(await generateDue(nextRun)).toHaveLength(1);
  });

  it("stops covering once the included visits are used, and counts each job once", async () => {
    const context = await setup();
    const { contractId, planId } = await arrange(context, 1);
    const [first] = await generateDue(new Date("2026-11-07T08:00:00Z"));
    const firstDone = await complete(context, first!.workOrderId);
    expect(firstDone.invoice.total).toBe("0");
    const reprice = await request(app).patch(api(`/invoices/${firstDone.invoice.id as string}`)).set(auth(context.opsToken)).send({ notes: "Checked" });
    expect(reprice.body.data).toMatchObject({ coverageSource: "CONTRACT", total: "0" });

    await request(app).patch(api(`/maintenance-plans/${planId}`)).set(auth(context.opsToken)).send({ nextDueOn: "2026-11-08" });
    const [second] = await generateDue(new Date("2026-11-07T10:00:00Z"));
    const secondDone = await complete(context, second!.workOrderId);
    const invoice = await request(app).get(api(`/invoices/${secondDone.invoice.id as string}`)).set(auth(context.opsToken));
    expect(invoice.body.data.coverageSource).toBe("NONE");
    expect(Number(invoice.body.data.total)).toBeGreaterThan(0);
    const contract = await prisma.serviceContract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.usedVisits).toBe(1);
  });

  it("pauses and resumes, and skips plans whose contract has ended", async () => {
    const context = await setup();
    const { planId, contractId } = await arrange(context);
    const paused = await request(app).post(api(`/maintenance-plans/${planId}/pause`)).set(auth(context.opsToken));
    expect(paused.body.data.isActive).toBe(false);
    const again = await request(app).post(api(`/maintenance-plans/${planId}/pause`)).set(auth(context.opsToken));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");
    expect(await generateDue(new Date("2026-11-08T00:00:00Z"))).toEqual([]);
    await request(app).post(api(`/maintenance-plans/${planId}/resume`)).set(auth(context.opsToken));
    expect((await request(app).post(api(`/maintenance-plans/${planId}/resume`)).set(auth(context.opsToken))).status).toBe(409);

    await request(app).post(api(`/contracts/${contractId}/cancel`)).set(auth(context.opsToken)).send({ reason: "Ended" });
    expect(await generateDue(new Date("2026-11-08T00:00:00Z"))).toEqual([]);
    expect(await prisma.workOrder.count({ where: { maintenancePlanId: planId } })).toBe(0);
  });

  it("runs on demand for the office and validates input, roles and org", async () => {
    const context = await setup();
    const { assetId, serviceTypeId, planId } = await arrange(context);
    await request(app).patch(api(`/maintenance-plans/${planId}`)).set(auth(context.opsToken)).send({ nextDueOn: "2026-01-01" });
    const run = await request(app).post(api("/maintenance-plans/run")).set(auth(context.opsToken));
    expect(run.status).toBe(200);
    expect(run.body.data).toHaveLength(1);

    const bad = await request(app).post(api("/maintenance-plans")).set(auth(context.opsToken)).send({ assetId, serviceTypeId, name: "x", intervalDays: 0, firstDueOn: "2026-11-01" });
    expect(bad.status).toBe(400);
    await context.workOrder();
    const otherAsset = await prisma.asset.findFirstOrThrow({ where: { NOT: { id: assetId } } });
    const uncovered = await request(app)
      .post(api("/maintenance-plans"))
      .set(auth(context.opsToken))
      .send({ assetId: otherAsset.id, serviceTypeId, contractId: (await prisma.serviceContract.findFirstOrThrow()).id, name: "x", intervalDays: 30, firstDueOn: "2026-11-01" });
    expect(uncovered.status).toBe(400);
    const tara = await login("tara@example.com");
    expect((await request(app).get(api("/maintenance-plans")).set(auth(tara))).status).toBe(403);
    expect((await request(app).post(api("/maintenance-plans/run")).set(auth(context.ownerToken))).status).toBe(403);
    expect((await request(app).post(api(`/maintenance-plans/${planId}/pause`)).set(auth(context.ownerToken))).status).toBe(403);
    const mine = await request(app).get(api("/maintenance-plans")).set(auth(context.ownerToken));
    expect(mine.body.data.map((row: { id: string }) => row.id)).toEqual([planId]);

    const other = await prisma.organization.create({ data: { name: "Other" } });
    await prisma.user.create({ data: { organizationId: other.id, email: "x@other.com", name: "X", role: "OPS", passwordHash: (await prisma.user.findFirstOrThrow({ where: { email: "ops@example.com" } })).passwordHash } });
    const outsider = await login("x@other.com");
    expect((await request(app).get(api(`/maintenance-plans/${planId}`)).set(auth(outsider))).status).toBe(404);
    expect((await request(app).post(api(`/maintenance-plans/${planId}/pause`)).set(auth(outsider))).status).toBe(404);
  });
});
