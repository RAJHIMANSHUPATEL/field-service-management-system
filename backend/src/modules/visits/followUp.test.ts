import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";

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

const api = (path: string) => `/api/v1${path}`;

async function onSite(steps = ["en-route", "arrive", "start"]) {
  const context = await setup();
  const part = await request(app).post(api("/parts")).set(auth(context.opsToken)).send({ sku: "valve-9", name: "Gas valve", unitPrice: "3200.00" });
  const job = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
  const tara = await login("tara@example.com");
  for (const step of steps) {
    expect((await request(app).post(api(`/visits/${job.visitId}/${step}`)).set(auth(tara))).status).toBe(200);
  }
  return { context, tara, partId: part.body.data.id as string, ...job };
}

describe("incomplete jobs and follow-up", () => {
  it("completes on visit two after visit one ends awaiting parts, with the work order open in between", async () => {
    const { context, tara, partId, visitId, workOrderId } = await onSite();
    const ended = await request(app)
      .post(api(`/visits/${visitId}/unsuccessful`))
      .set(auth(tara))
      .send({ outcome: "AWAITING_PARTS", reason: "Gas valve failed, none on the van", partRequests: [{ partId, quantity: 1 }] });
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe("AWAITING_PARTS");
    expect(ended.body.data.visits[0]).toMatchObject({ status: "UNSUCCESSFUL", outcomeReason: "Gas valve failed, none on the van" });
    expect(ended.body.data.visits[0].endedAt).toEqual(expect.any(String));
    expect(ended.body.data.partRequests).toMatchObject([{ status: "OPEN", quantity: 1, part: { id: partId } }]);

    // The customer sees the job is still open and why.
    const requestId = ended.body.data.request.id as string;
    const customerView = await request(app).get(api(`/service-requests/${requestId}`)).set(auth(context.ownerToken));
    expect(customerView.body.data.status).toBe("ACCEPTED");
    expect(customerView.body.data.workOrder.status).toBe("AWAITING_PARTS");
    expect(customerView.body.data.workOrder.visits[0]).toMatchObject({ status: "UNSUCCESSFUL", outcomeReason: "Gas valve failed, none on the van" });

    // Visit two cannot be planned while parts are outstanding.
    const blocked = await request(app).post(api(`/work-orders/${workOrderId}/schedule`)).set(auth(context.opsToken)).send({ scheduledStart: "2026-11-05T10:00:00.000Z" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("INVALID_TRANSITION");

    const open = await request(app).get(api("/part-requests?status=OPEN")).set(auth(context.opsToken));
    expect(open.body.data).toHaveLength(1);
    const fulfilled = await request(app).post(api(`/part-requests/${open.body.data[0].id as string}/fulfil`)).set(auth(context.opsToken)).send({});
    expect(fulfilled.status).toBe(200);
    expect(fulfilled.body.data).toMatchObject({ status: "FULFILLED", workOrder: { status: "FOLLOW_UP_REQUIRED" } });
    expect((await request(app).post(api(`/part-requests/${open.body.data[0].id as string}/fulfil`)).set(auth(context.opsToken)).send({})).status).toBe(409);

    // Visit two: schedule, accept, drive, complete.
    const second = await request(app).post(api(`/work-orders/${workOrderId}/schedule`)).set(auth(context.opsToken)).send({ scheduledStart: "2026-11-05T10:00:00.000Z" });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("ASSIGNED");
    expect(second.body.data.visits).toHaveLength(2);
    const visitTwo = second.body.data.visits[1].id as string;
    expect((await request(app).post(api(`/work-orders/${workOrderId}/accept`)).set(auth(tara))).status).toBe(200);
    for (const step of ["en-route", "arrive", "start"]) {
      expect((await request(app).post(api(`/visits/${visitTwo}/${step}`)).set(auth(tara))).status).toBe(200);
    }
    await request(app).patch(api(`/visits/${visitTwo}/report`)).set(auth(tara)).send({ workPerformed: "Fitted the new gas valve" });
    await request(app).post(api(`/visits/${visitTwo}/signature`)).set(auth(tara)).send(signature);
    const done = await request(app).post(api(`/visits/${visitTwo}/complete`)).set(auth(tara));
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("COMPLETED");
    expect(done.body.data.visits.map((visit: { status: string }) => visit.status)).toEqual(["UNSUCCESSFUL", "COMPLETED"]);

    const statuses = await prisma.auditEvent.findMany({ where: { action: { in: ["visits.unsuccessful", "part-requests.fulfil"] } } });
    expect(statuses).toHaveLength(2);
  });

  it("goes straight to FOLLOW_UP_REQUIRED from arrival, releasing reserved parts", async () => {
    const { context, tara, visitId, workOrderId } = await onSite(["en-route", "arrive"]);
    const central = await request(app).post(api("/warehouses")).set(auth(context.opsToken)).send({ name: "Van", kind: "VAN", technicianId: context.technicians.tara });
    const part = await request(app).post(api("/parts")).set(auth(context.opsToken)).send({ sku: "f-1", name: "Filter", unitPrice: "10.00" });
    await request(app).post(api("/inventory/receipts")).set(auth(context.opsToken)).send({ warehouseId: central.body.data.id, partId: part.body.data.id, quantity: 2, reason: "Stock" });
    await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId: part.body.data.id, quantity: 2 });
    const ended = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "FOLLOW_UP_REQUIRED", reason: "Customer not home" });
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe("FOLLOW_UP_REQUIRED");
    expect(ended.body.data.visits[0].parts[0].status).toBe("RELEASED");
    const level = await prisma.stockLevel.findFirstOrThrow({ where: { partId: part.body.data.id } });
    expect(level).toMatchObject({ onHand: 2, reserved: 0 });
    expect(ended.body.data.notes.at(-1).body).toContain("Customer not home");
    const scheduled = await request(app).post(api(`/work-orders/${workOrderId}/schedule`)).set(auth(context.opsToken)).send({ scheduledStart: "2026-11-06T10:00:00.000Z" });
    expect(scheduled.status).toBe(200);
  });

  it("rejects illegal outcomes, inputs, and actors", async () => {
    const { context, tara, partId, visitId } = await onSite(["en-route"]);
    // Not on site yet.
    const early = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "FOLLOW_UP_REQUIRED", reason: "x" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("INVALID_TRANSITION");
    await request(app).post(api(`/visits/${visitId}/arrive`)).set(auth(tara));
    const noParts = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "AWAITING_PARTS", reason: "x" });
    expect(noParts.status).toBe(400);
    expect((await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "DONE", reason: "x" })).status).toBe(400);
    expect((await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "FOLLOW_UP_REQUIRED", reason: " " })).status).toBe(400);
    const unknownPart = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "AWAITING_PARTS", reason: "x", partRequests: [{ partId: "missing", quantity: 1 }] });
    expect(unknownPart.status).toBe(404);
    const sam = await login("sam@example.com");
    for (const token of [sam, context.opsToken, context.ownerToken]) {
      const denied = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(token)).send({ outcome: "AWAITING_PARTS", reason: "x", partRequests: [{ partId, quantity: 1 }] });
      expect(denied.status).toBe(403);
    }
    const ended = await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "AWAITING_PARTS", reason: "x", partRequests: [{ partId, quantity: 1 }] });
    expect(ended.status).toBe(200);
    // Over and done: no second outcome, no completion, no more steps.
    expect((await request(app).post(api(`/visits/${visitId}/unsuccessful`)).set(auth(tara)).send({ outcome: "FOLLOW_UP_REQUIRED", reason: "x" })).status).toBe(409);
    expect((await request(app).post(api(`/visits/${visitId}/complete`)).set(auth(tara))).status).toBe(409);
    expect((await request(app).post(api(`/visits/${visitId}/start`)).set(auth(tara))).status).toBe(409);
    const requestId = ended.body.data.partRequests[0].id as string;
    for (const token of [tara, context.ownerToken]) {
      expect((await request(app).post(api(`/part-requests/${requestId}/fulfil`)).set(auth(token)).send({})).status).toBe(403);
      expect((await request(app).get(api("/part-requests")).set(auth(token))).status).toBe(403);
    }
    expect((await request(app).post(api("/part-requests/missing/fulfil")).set(auth(context.opsToken)).send({})).status).toBe(404);
    const cancelled = await request(app).post(api(`/part-requests/${requestId}/cancel`)).set(auth(context.opsToken)).send({ note: "Customer will buy it" });
    expect(cancelled.body.data).toMatchObject({ status: "CANCELLED", note: "Customer will buy it", workOrder: { status: "FOLLOW_UP_REQUIRED" } });
    expect((await request(app).post(api(`/part-requests/${requestId}/fulfil`)).set(auth(context.opsToken)).send({})).status).toBe(409);
  });
});
