import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";

const password = "Password123!";
let passwordHash: string;

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  passwordHash = await argon2.hash(password);
});

beforeEach(async () => {
  await resetDatabase();
  const organization = await prisma.organization.create({ data: { name: "Visit Co" } });
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: "ops@example.com",
      name: "Ops",
      role: "OPS",
      passwordHash,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openWorkOrder() {
  const adminToken = await login("admin@example.com");
  const customer = await request(app).post("/api/v1/customers").set(auth(adminToken)).send({ name: "Owner Co" });
  const customerId = customer.body.data.id as string;
  await request(app).post(`/api/v1/customers/${customerId}/contacts`).set(auth(adminToken)).send({
    name: "Owner",
    email: "owner@example.com",
    password,
  });
  const address = await request(app).post(`/api/v1/customers/${customerId}/addresses`).set(auth(adminToken)).send({
    label: "Site",
    line1: "10 Main",
    city: "Austin",
    state: "TX",
    postalCode: "78702",
  });
  const serviceType = await request(app)
    .post("/api/v1/service-types")
    .set(auth(adminToken))
    .send({ name: "Repair" });
  const asset = await request(app).post("/api/v1/assets").set(auth(adminToken)).send({
    customerId,
    addressId: address.body.data.id,
    equipmentType: "Boiler",
    model: "Heat 1",
    serialNumber: "B-1",
  });
  const ownerToken = await login("owner@example.com");
  const created = await request(app).post("/api/v1/service-requests").set(auth(ownerToken)).send({
    assetId: asset.body.data.id,
    serviceTypeId: serviceType.body.data.id,
    description: "No heat",
    preferredStart: "2026-10-06",
    preferredEnd: "2026-10-08",
  });
  const opsToken = await login("ops@example.com");
  const accepted = await request(app)
    .post(`/api/v1/service-requests/${created.body.data.id as string}/accept`)
    .set(auth(opsToken))
    .send({});
  return {
    adminToken,
    opsToken,
    ownerToken,
    workOrderId: accepted.body.data.workOrder.id as string,
  };
}

async function addTechnician(adminToken: string, email: string) {
  const created = await request(app).post("/api/v1/technicians").set(auth(adminToken)).send({
    name: email,
    email,
    password,
  });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
}

const visitStart = "2026-10-06T15:00:00.000Z";

async function assignedJob() {
  const context = await openWorkOrder();
  const technicianId = await addTechnician(context.adminToken, "tara@example.com");
  const assigned = await request(app)
    .post(`/api/v1/work-orders/${context.workOrderId}/assign`)
    .set(auth(context.opsToken))
    .send({ technicianId });
  expect(assigned.status).toBe(200);
  const taraToken = await login("tara@example.com");
  return { ...context, technicianId, taraToken };
}

async function acceptedJob() {
  const context = await assignedJob();
  const scheduled = await request(app)
    .post(`/api/v1/work-orders/${context.workOrderId}/schedule`)
    .set(auth(context.opsToken))
    .send({ scheduledStart: visitStart });
  expect(scheduled.status).toBe(200);
  const accepted = await request(app).post(`/api/v1/work-orders/${context.workOrderId}/accept`).set(auth(context.taraToken));
  expect(accepted.status).toBe(200);
  return { ...context, visitId: scheduled.body.data.visits[0].id as string };
}

function step(visitId: string, name: string, token: string) {
  return request(app).post(`/api/v1/visits/${visitId}/${name}`).set(auth(token));
}

describe("visit start", () => {
  it("moves the visit en route, arrived, then in progress and starts the work order", async () => {
    const { visitId, taraToken } = await acceptedJob();

    const enRoute = await step(visitId, "en-route", taraToken);
    expect(enRoute.status).toBe(200);
    expect(enRoute.body.data.status).toBe("ACCEPTED");
    expect(enRoute.body.data.visits[0].status).toBe("EN_ROUTE");

    const arrived = await step(visitId, "arrive", taraToken);
    expect(arrived.status).toBe(200);
    expect(arrived.body.data.status).toBe("ACCEPTED");
    expect(arrived.body.data.visits[0].status).toBe("ARRIVED");

    const started = await step(visitId, "start", taraToken);
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe("IN_PROGRESS");
    expect(started.body.data.visits[0].status).toBe("IN_PROGRESS");
    expect(started.body.data.request.status).toBe("ACCEPTED");
  });

  it("rejects skipped and repeated steps", async () => {
    const { visitId, taraToken } = await acceptedJob();

    for (const name of ["arrive", "start"]) {
      const skipped = await step(visitId, name, taraToken);
      expect(skipped.status).toBe(409);
      expect(skipped.body.error.code).toBe("INVALID_TRANSITION");
    }

    expect((await step(visitId, "en-route", taraToken)).status).toBe(200);
    const again = await step(visitId, "en-route", taraToken);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");
    const early = await step(visitId, "start", taraToken);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("INVALID_TRANSITION");

    expect((await step(visitId, "arrive", taraToken)).status).toBe(200);
    expect((await step(visitId, "start", taraToken)).status).toBe(200);
    const restarted = await step(visitId, "start", taraToken);
    expect(restarted.status).toBe(409);
    expect(restarted.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects another technician, ops, and the customer", async () => {
    const { adminToken, opsToken, ownerToken, visitId } = await acceptedJob();
    await addTechnician(adminToken, "sam@example.com");
    const samToken = await login("sam@example.com");

    const other = await step(visitId, "en-route", samToken);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("FORBIDDEN");

    for (const token of [opsToken, adminToken, ownerToken]) {
      const response = await step(visitId, "en-route", token);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }

    const visit = await prisma.serviceVisit.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.status).toBe("SCHEDULED");
  });

  it("rejects a cancelled visit and a visit whose job is not accepted", async () => {
    const { opsToken, workOrderId, taraToken } = await assignedJob();
    const scheduled = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(opsToken))
      .send({ scheduledStart: visitStart });
    const visitId = scheduled.body.data.visits[0].id as string;

    const notAccepted = await step(visitId, "en-route", taraToken);
    expect(notAccepted.status).toBe(409);
    expect(notAccepted.body.error.code).toBe("INVALID_TRANSITION");

    await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/decline`)
      .set(auth(taraToken))
      .send({ reason: "Cannot go" });
    const visit = await prisma.serviceVisit.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.status).toBe("CANCELLED");

    const cancelled = await step(visitId, "en-route", taraToken);
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns not found for an unknown visit", async () => {
    const { taraToken } = await acceptedJob();
    const missing = await step("missing-visit", "en-route", taraToken);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("VISIT_NOT_FOUND");
  });
});
