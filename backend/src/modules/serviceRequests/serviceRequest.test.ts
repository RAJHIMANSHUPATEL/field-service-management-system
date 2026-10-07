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
  const organization = await prisma.organization.create({ data: { name: "Request Co" } });
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

async function createAssetFor(email: string, serialNumber: string) {
  const adminToken = await login("admin@example.com");
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth(adminToken))
    .send({ name: email });
  const customerId = customer.body.data.id as string;
  await request(app).post(`/api/v1/customers/${customerId}/contacts`).set(auth(adminToken)).send({
    name: email,
    email,
    password,
  });
  const address = await request(app)
    .post(`/api/v1/customers/${customerId}/addresses`)
    .set(auth(adminToken))
    .send({
      label: "Site",
      line1: "10 Main",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
    });
  const serviceType = await request(app)
    .post("/api/v1/service-types")
    .set(auth(adminToken))
    .send({ name: `Repair ${serialNumber}` });
  const asset = await request(app).post("/api/v1/assets").set(auth(adminToken)).send({
    customerId,
    addressId: address.body.data.id,
    equipmentType: "Boiler",
    model: "Heat 1",
    serialNumber,
  });
  return {
    assetId: asset.body.data.id as string,
    serviceTypeId: serviceType.body.data.id as string,
  };
}

describe("service requests", () => {
  it("lets a customer create a request and hides another customer's request", async () => {
    const own = await createAssetFor("owner@example.com", "OWN-1");
    const other = await createAssetFor("other@example.com", "OTHER-1");
    const ownerToken = await login("owner@example.com");
    const otherToken = await login("other@example.com");

    const created = await request(app).post("/api/v1/service-requests").set(auth(ownerToken)).send({
      assetId: own.assetId,
      serviceTypeId: own.serviceTypeId,
      description: "No heat",
      preferredStart: "2026-10-06",
      preferredEnd: "2026-10-08",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("SUBMITTED");
    expect(created.body.data.priority).toBe("NORMAL");

    const otherCreated = await request(app).post("/api/v1/service-requests").set(auth(otherToken)).send({
      assetId: other.assetId,
      serviceTypeId: other.serviceTypeId,
      description: "Leak",
      preferredStart: "2026-10-06",
      preferredEnd: "2026-10-08",
    });
    const hidden = await request(app)
      .get(`/api/v1/service-requests/${otherCreated.body.data.id as string}`)
      .set(auth(ownerToken));
    expect(hidden.status).toBe(403);
    expect(hidden.body.error.code).toBe("FORBIDDEN");
  });

  it("lets ops accept a request into an open work order", async () => {
    const own = await createAssetFor("owner@example.com", "OWN-2");
    const ownerToken = await login("owner@example.com");
    const created = await request(app).post("/api/v1/service-requests").set(auth(ownerToken)).send({
      assetId: own.assetId,
      serviceTypeId: own.serviceTypeId,
      description: "No heat",
      preferredStart: "2026-10-06",
      preferredEnd: "2026-10-08",
    });
    const requestId = created.body.data.id as string;
    const opsToken = await login("ops@example.com");

    const accepted = await request(app)
      .post(`/api/v1/service-requests/${requestId}/accept`)
      .set(auth(opsToken))
      .send({ priority: "HIGH", note: "Scheduled for triage" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe("ACCEPTED");
    expect(accepted.body.data.priority).toBe("HIGH");
    expect(accepted.body.data.workOrder.status).toBe("OPEN");

    const workOrders = await request(app).get("/api/v1/work-orders").set(auth(opsToken));
    expect(workOrders.status).toBe(200);
    expect(workOrders.body.data).toHaveLength(1);
    expect(workOrders.body.data[0].request.id).toBe(requestId);

    const again = await request(app)
      .post(`/api/v1/service-requests/${requestId}/accept`)
      .set(auth(opsToken))
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("records a note when ops rejects or asks for information", async () => {
    const own = await createAssetFor("owner@example.com", "OWN-3");
    const ownerToken = await login("owner@example.com");
    const opsToken = await login("ops@example.com");

    async function file(description: string) {
      const created = await request(app).post("/api/v1/service-requests").set(auth(ownerToken)).send({
        assetId: own.assetId,
        serviceTypeId: own.serviceTypeId,
        description,
        preferredStart: "2026-10-06",
        preferredEnd: "2026-10-08",
      });
      return created.body.data.id as string;
    }

    const rejectedId = await file("Reject me");
    const rejected = await request(app)
      .post(`/api/v1/service-requests/${rejectedId}/reject`)
      .set(auth(opsToken))
      .send({ reason: "Out of coverage" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");
    expect(rejected.body.data.notes.some((note: { body: string }) => note.body === "Out of coverage")).toBe(true);

    const infoId = await file("Need info");
    const info = await request(app)
      .post(`/api/v1/service-requests/${infoId}/request-info`)
      .set(auth(opsToken))
      .send({ message: "Which room?" });
    expect(info.status).toBe(200);
    expect(info.body.data.status).toBe("NEEDS_INFO");
    expect(info.body.data.notes.some((note: { body: string }) => note.body === "Which room?")).toBe(true);

    const reply = await request(app)
      .post(`/api/v1/service-requests/${infoId}/reply`)
      .set(auth(ownerToken))
      .send({ message: "The lobby" });
    expect(reply.status).toBe(200);
    expect(reply.body.data.status).toBe("SUBMITTED");
  });

  it("rejects a technician listing requests", async () => {
    const adminToken = await login("admin@example.com");
    await request(app).post("/api/v1/technicians").set(auth(adminToken)).send({
      name: "Blocked Tech",
      email: "blocked@example.com",
      password,
    });
    const technicianToken = await login("blocked@example.com");
    const response = await request(app).get("/api/v1/service-requests").set(auth(technicianToken));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});