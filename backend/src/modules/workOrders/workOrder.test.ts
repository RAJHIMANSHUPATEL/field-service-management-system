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
  const organization = await prisma.organization.create({ data: { name: "Assign Co" } });
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

describe("work order assignment", () => {
  it("lets ops assign a technician and hides the job from another technician", async () => {
    const { adminToken, opsToken, workOrderId } = await openWorkOrder();
    const firstId = await addTechnician(adminToken, "tara@example.com");
    const secondId = await addTechnician(adminToken, "sam@example.com");

    const assigned = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/assign`)
      .set(auth(opsToken))
      .send({ technicianId: firstId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.status).toBe("ASSIGNED");
    expect(assigned.body.data.technician.id).toBe(firstId);

    const taraToken = await login("tara@example.com");
    const jobs = await request(app).get("/api/v1/work-orders").set(auth(taraToken));
    expect(jobs.status).toBe(200);
    expect(jobs.body.data).toHaveLength(1);
    expect(jobs.body.data[0].id).toBe(workOrderId);

    const samToken = await login("sam@example.com");
    const hidden = await request(app).get(`/api/v1/work-orders/${workOrderId}`).set(auth(samToken));
    expect(hidden.status).toBe(403);
    expect(hidden.body.error.code).toBe("FORBIDDEN");

    const samJobs = await request(app).get("/api/v1/work-orders").set(auth(samToken));
    expect(samJobs.body.data).toHaveLength(0);

    const inactive = await request(app)
      .patch(`/api/v1/technicians/${secondId}`)
      .set(auth(adminToken))
      .send({ isActive: false });
    expect(inactive.status).toBe(200);
    const rejected = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/assign`)
      .set(auth(opsToken))
      .send({ technicianId: secondId });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("TECHNICIAN_INACTIVE");

    const thirdId = await addTechnician(adminToken, "nia@example.com");
    const replaced = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/assign`)
      .set(auth(opsToken))
      .send({ technicianId: thirdId });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.status).toBe("ASSIGNED");
    expect(replaced.body.data.technician.id).toBe(thirdId);

    const taraAfter = await request(app).get("/api/v1/work-orders").set(auth(taraToken));
    expect(taraAfter.body.data).toHaveLength(0);
  });

  it("rejects a customer listing work orders", async () => {
    const { ownerToken } = await openWorkOrder();
    const response = await request(app).get("/api/v1/work-orders").set(auth(ownerToken));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});

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

describe("work order schedule and accept", () => {
  it("schedules a visit and lets the assigned technician accept", async () => {
    const { opsToken, workOrderId, taraToken } = await assignedJob();
    const scheduled = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(opsToken))
      .send({ scheduledStart: visitStart });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.data.status).toBe("ASSIGNED");
    expect(scheduled.body.data.visits[0].status).toBe("SCHEDULED");

    const accepted = await request(app).post(`/api/v1/work-orders/${workOrderId}/accept`).set(auth(taraToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe("ACCEPTED");
    expect(accepted.body.data.visits[0].status).toBe("SCHEDULED");
    expect(accepted.body.data.request.status).toBe("ACCEPTED");
  });

  it("rejects accept when no visit is scheduled", async () => {
    const { workOrderId, taraToken } = await assignedJob();
    const accepted = await request(app).post(`/api/v1/work-orders/${workOrderId}/accept`).set(auth(taraToken));
    expect(accepted.status).toBe(409);
    expect(accepted.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns the job to open when the technician declines before a visit", async () => {
    const { opsToken, workOrderId, taraToken, technicianId } = await assignedJob();
    const declined = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/decline`)
      .set(auth(taraToken))
      .send({ reason: "Cannot make that day" });
    expect(declined.status).toBe(200);
    expect(declined.body.data.status).toBe("OPEN");
    expect(declined.body.data.technician).toBeNull();
    expect(declined.body.data.notes[0].body).toBe("Cannot make that day");

    const hidden = await request(app).get(`/api/v1/work-orders/${workOrderId}`).set(auth(taraToken));
    expect(hidden.status).toBe(403);

    const reassigned = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/assign`)
      .set(auth(opsToken))
      .send({ technicianId });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.status).toBe("ASSIGNED");
  });

  it("cancels the visit when the technician declines", async () => {
    const { opsToken, workOrderId, taraToken } = await assignedJob();
    await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(opsToken))
      .send({ scheduledStart: visitStart });

    const declined = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/decline`)
      .set(auth(taraToken))
      .send({ reason: "Need a different day" });
    expect(declined.status).toBe(200);
    expect(declined.body.data.status).toBe("OPEN");
    expect(declined.body.data.visits[0].status).toBe("CANCELLED");
    expect(declined.body.data.technician).toBeNull();
  });

  it("rejects a second schedule and a new assignment while a visit is scheduled", async () => {
    const { adminToken, opsToken, workOrderId } = await assignedJob();
    const first = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(opsToken))
      .send({ scheduledStart: visitStart });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .set(auth(opsToken))
      .send({ scheduledStart: "2026-10-07T15:00:00.000Z" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("INVALID_TRANSITION");

    const otherId = await addTechnician(adminToken, "nia@example.com");
    const reassigned = await request(app)
      .post(`/api/v1/work-orders/${workOrderId}/assign`)
      .set(auth(opsToken))
      .send({ technicianId: otherId });
    expect(reassigned.status).toBe(409);
    expect(reassigned.body.error.code).toBe("INVALID_TRANSITION");
  });
});
