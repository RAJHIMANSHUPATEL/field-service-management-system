import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, hashedPassword, login, password, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("reschedule and cancel with history", () => {
  it("reaches ACCEPTED with a SCHEDULED visit, and a reschedule leaves an auditable trail", async () => {
    const context = await setup();
    const { workOrderId, visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const before = await request(app).get(`/api/v1/work-orders/${workOrderId}`).set(auth(context.opsToken));
    expect(before.body.data.status).toBe("ACCEPTED");
    expect(before.body.data.visits[0].status).toBe("SCHEDULED");

    const moved = await request(app)
      .post(`/api/v1/visits/${visitId}/reschedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-04T14:00:00.000Z", reason: "Customer asked for Wednesday" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe("ACCEPTED");
    const visit = moved.body.data.visits[0];
    expect(visit.scheduledStart).toBe("2026-11-04T14:00:00.000Z");
    expect(visit.changes.map((c: { kind: string }) => c.kind)).toEqual(["SCHEDULED", "RESCHEDULED"]);
    expect(visit.changes[1]).toMatchObject({
      fromStart: "2026-11-03T10:00:00.000Z",
      toStart: "2026-11-04T14:00:00.000Z",
      reason: "Customer asked for Wednesday",
      actor: { name: "Ops" },
    });

    const audit = await request(app)
      .get(`/api/v1/audit-events?entityType=visits&entityId=${visitId}`)
      .set(auth(context.adminToken));
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual(["visits.reschedule"]);
  });

  it("cancels a scheduled visit back to ASSIGNED and rejects replanning a visit that is not scheduled", async () => {
    const context = await setup();
    const { workOrderId, visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const cancelled = await request(app)
      .post(`/api/v1/visits/${visitId}/cancel`)
      .set(auth(context.opsToken))
      .send({ reason: "Site closed" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("ASSIGNED");
    expect(cancelled.body.data.visits[0].status).toBe("CANCELLED");
    expect(cancelled.body.data.visits[0].changes.at(-1)).toMatchObject({ kind: "CANCELLED", reason: "Site closed" });

    for (const [path, body] of [
      ["cancel", { reason: "Again" }],
      ["reschedule", { scheduledStart: "2026-11-05T10:00:00.000Z", reason: "Late" }],
    ] as const) {
      const response = await request(app).post(`/api/v1/visits/${visitId}/${path}`).set(auth(context.opsToken)).send(body);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
    }

    const again = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-05T10:00:00.000Z" });
    expect(again.status).toBe(200);
    const second = again.body.data.visits.find((v: { status: string }) => v.status === "SCHEDULED");
    const taraToken = await login("tara@example.com");
    await request(app).post(`/api/v1/work-orders/${workOrderId}/accept`).set(auth(taraToken));
    await request(app).post(`/api/v1/visits/${second.id as string}/en-route`).set(auth(taraToken));
    const enRoute = await request(app)
      .post(`/api/v1/visits/${second.id as string}/reschedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-06T10:00:00.000Z", reason: "Late" });
    expect(enRoute.status).toBe(409);
    expect(enRoute.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("limits replanning to admin and ops in the same organization", async () => {
    const context = await setup();
    const { visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const taraToken = await login("tara@example.com");
    const tech = await request(app)
      .post(`/api/v1/visits/${visitId}/cancel`)
      .set(auth(taraToken))
      .send({ reason: "No" });
    expect(tech.status).toBe(403);
    expect(tech.body.error.code).toBe("FORBIDDEN");

    const passwordHash = await hashedPassword();
    const other = await prisma.organization.create({ data: { name: "Other" } });
    await prisma.user.create({
      data: { organizationId: other.id, email: "x@other.example", name: "X", role: "OPS", passwordHash },
    });
    const otherToken = await login("x@other.example");
    const hidden = await request(app)
      .post(`/api/v1/visits/${visitId}/cancel`)
      .set(auth(otherToken))
      .send({ reason: "No" });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("VISIT_NOT_FOUND");
  });
});

describe("double booking and time off", () => {
  it("blocks overlapping visits and booking inside time off", async () => {
    const context = await setup();
    await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const id = await context.workOrder();
    await request(app)
      .post(`/api/v1/work-orders/${id}/assign`)
      .set(auth(context.opsToken))
      .send({ technicianId: context.technicians.tara });
    const overlap = await request(app)
      .post(`/api/v1/work-orders/${id}/schedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-03T11:00:00.000Z" });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe("SCHEDULE_CONFLICT");

    const off = await request(app)
      .post(`/api/v1/technicians/${context.technicians.tara}/time-off`)
      .set(auth(context.opsToken))
      .send({ startsAt: "2026-11-05T00:00:00.000Z", endsAt: "2026-11-06T00:00:00.000Z", reason: "Leave" });
    expect(off.status).toBe(201);
    const duringLeave = await request(app)
      .post(`/api/v1/work-orders/${id}/schedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-05T09:00:00.000Z" });
    expect(duringLeave.status).toBe(409);
    expect(duringLeave.body.error.details.kind).toBe("TIME_OFF");

    const after = await request(app)
      .post(`/api/v1/work-orders/${id}/schedule`)
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-03T12:00:00.000Z" });
    expect(after.status).toBe(200);

    const overBooked = await request(app)
      .post(`/api/v1/technicians/${context.technicians.tara}/time-off`)
      .set(auth(context.opsToken))
      .send({ startsAt: "2026-11-03T00:00:00.000Z", endsAt: "2026-11-04T00:00:00.000Z" });
    expect(overBooked.status).toBe(409);
  });
});

describe("reassignment", () => {
  it("moves an accepted job and its visit to another technician who must accept again", async () => {
    const context = await setup();
    const { workOrderId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const moved = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/reassign`)
      .set(auth(context.opsToken))
      .send({ technicianId: context.technicians.sam, reason: "Tara is sick" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe("ASSIGNED");
    expect(moved.body.data.technician.id).toBe(context.technicians.sam);
    expect(moved.body.data.visits[0].technician.id).toBe(context.technicians.sam);
    expect(moved.body.data.visits[0].changes.at(-1)).toMatchObject({
      kind: "REASSIGNED",
      fromTechnicianId: context.technicians.tara,
      toTechnicianId: context.technicians.sam,
    });

    const taraToken = await login("tara@example.com");
    expect((await request(app).get(`/api/v1/work-orders/${workOrderId}`).set(auth(taraToken))).status).toBe(403);
    const samToken = await login("sam@example.com");
    const accepted = await request(app).post(`/api/v1/work-orders/${workOrderId}/accept`).set(auth(samToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe("ACCEPTED");
  });

  it("rejects reassigning an open job, the same technician, and non-planners", async () => {
    const context = await setup();
    const open = await context.workOrder();
    const openMove = await request(app)
      .post(`/api/v1/work-orders/${open}/reassign`)
      .set(auth(context.opsToken))
      .send({ technicianId: context.technicians.sam, reason: "x" });
    expect(openMove.status).toBe(409);
    expect(openMove.body.error.code).toBe("INVALID_TRANSITION");

    const { workOrderId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const same = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/reassign`)
      .set(auth(context.opsToken))
      .send({ technicianId: context.technicians.tara, reason: "x" });
    expect(same.status).toBe(409);
    const taraToken = await login("tara@example.com");
    const tech = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/reassign`)
      .set(auth(taraToken))
      .send({ technicianId: context.technicians.sam, reason: "x" });
    expect(tech.status).toBe(403);
  });
});

describe("assignment scoring and calendar", () => {
  it("ranks technicians by skill, area, workload and availability", async () => {
    const context = await setup();
    const id = await context.workOrder();
    const ranked = await request(app).get(`/api/v1/work-orders/${id}/candidates`).set(auth(context.opsToken));
    expect(ranked.status).toBe(200);
    expect(ranked.body.data.map((r: { name: string; score: number }) => [r.name, r.score])).toEqual([
      ["tara", 100],
      ["sam", 70],
      ["nia", 30],
    ]);
    expect(ranked.body.data[0].breakdown).toEqual({ skill: 40, area: 30, workload: 30 });

    await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const busy = await request(app)
      .get(`/api/v1/work-orders/${id}/candidates?at=2026-11-03T10:30:00.000Z`)
      .set(auth(context.opsToken));
    expect(busy.body.data.map((r: { name: string }) => r.name)).toEqual(["sam", "nia", "tara"]);
    expect(busy.body.data[2]).toMatchObject({ available: false, score: 90, openJobs: 1 });
  });

  it("shows the calendar to planners and only own visits to a technician", async () => {
    const context = await setup();
    await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    await scheduledJob(context, "sam", "2026-11-04T10:00:00.000Z", false);
    await request(app)
      .post(`/api/v1/technicians/${context.technicians.nia}/time-off`)
      .set(auth(context.opsToken))
      .send({ startsAt: "2026-11-05T00:00:00.000Z", endsAt: "2026-11-06T00:00:00.000Z" });
    const range = "from=2026-11-02T00:00:00.000Z&to=2026-11-09T00:00:00.000Z";
    const all = await request(app).get(`/api/v1/visits?${range}`).set(auth(context.opsToken));
    expect(all.status).toBe(200);
    expect(all.body.data.visits).toHaveLength(2);
    expect(all.body.data.timeOff).toHaveLength(1);

    const taraToken = await login("tara@example.com");
    const own = await request(app)
      .get(`/api/v1/visits?${range}&technicianId=${context.technicians.sam}`)
      .set(auth(taraToken));
    expect(own.body.data.visits.map((v: { technician: { id: string } }) => v.technician.id)).toEqual([
      context.technicians.tara,
    ]);
    const customer = await request(app).get(`/api/v1/visits?${range}`).set(auth(context.ownerToken));
    expect(customer.status).toBe(403);
    const bad = await request(app)
      .get("/api/v1/visits?from=2026-11-09T00:00:00.000Z&to=2026-11-02T00:00:00.000Z")
      .set(auth(context.opsToken));
    expect(bad.status).toBe(400);
  });
});
