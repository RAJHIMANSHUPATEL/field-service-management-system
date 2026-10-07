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
  const organization = await prisma.organization.create({ data: { name: "Attach Co" } });
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

async function submittedRequest() {
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
  const repair = await request(app).post("/api/v1/service-types").set(auth(adminToken)).send({ name: "Repair" });
  const install = await request(app).post("/api/v1/service-types").set(auth(adminToken)).send({ name: "Install" });
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
    serviceTypeId: repair.body.data.id,
    description: "No heat",
    preferredStart: "2026-10-06",
    preferredEnd: "2026-10-08",
  });
  expect(created.status).toBe(201);
  return {
    adminToken,
    ownerToken,
    opsToken: await login("ops@example.com"),
    requestId: created.body.data.id as string,
    installId: install.body.data.id as string,
  };
}

const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

describe("request attachments", () => {
  it("lets the customer attach a photo that ops can open", async () => {
    const { ownerToken, opsToken, requestId } = await submittedRequest();
    const uploaded = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(ownerToken))
      .set("Content-Type", "image/png")
      .set("X-File-Name", "leak photo.png")
      .send(png);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.fileName).toBe("leak photo.png");
    expect(uploaded.body.data.size).toBe(png.length);

    const detail = await request(app).get(`/api/v1/service-requests/${requestId}`).set(auth(opsToken));
    expect(detail.body.data.attachments).toHaveLength(1);

    const link = await request(app)
      .get(`/api/v1/service-requests/${requestId}/attachments/${uploaded.body.data.id as string}`)
      .set(auth(opsToken));
    expect(link.status).toBe(200);
    const file = await fetch(link.body.data.url as string);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true);
  });

  it("rejects bad types, empty files, oversize files, other customers, and rejected requests", async () => {
    const { adminToken, ownerToken, opsToken, requestId } = await submittedRequest();
    const text = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(ownerToken))
      .set("Content-Type", "text/plain")
      .set("X-File-Name", "a.txt")
      .send("hello");
    expect(text.status).toBe(400);

    const empty = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(ownerToken))
      .set("Content-Type", "image/png")
      .set("X-File-Name", "a.png")
      .send(Buffer.alloc(0));
    expect(empty.status).toBe(400);

    const huge = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(ownerToken))
      .set("Content-Type", "image/png")
      .set("X-File-Name", "big.png")
      .send(Buffer.alloc(10 * 1024 * 1024 + 10));
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe("FILE_TOO_LARGE");

    const other = await request(app).post("/api/v1/customers").set(auth(adminToken)).send({ name: "Other Co" });
    await request(app)
      .post(`/api/v1/customers/${other.body.data.id as string}/contacts`)
      .set(auth(adminToken))
      .send({ name: "Other", email: "other@example.com", password });
    const otherToken = await login("other@example.com");
    const forbidden = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(otherToken))
      .set("Content-Type", "image/png")
      .set("X-File-Name", "a.png")
      .send(png);
    expect(forbidden.status).toBe(403);

    await request(app)
      .post(`/api/v1/service-requests/${requestId}/reject`)
      .set(auth(opsToken))
      .send({ reason: "Duplicate" });
    const closed = await request(app)
      .post(`/api/v1/service-requests/${requestId}/attachments`)
      .set(auth(ownerToken))
      .set("Content-Type", "image/png")
      .set("X-File-Name", "a.png")
      .send(png);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("triage sets the service type", () => {
  it("accepts with a new service type and priority, and the customer sees the job status", async () => {
    const { ownerToken, opsToken, requestId, installId } = await submittedRequest();
    const accepted = await request(app)
      .post(`/api/v1/service-requests/${requestId}/accept`)
      .set(auth(opsToken))
      .send({ priority: "HIGH", serviceTypeId: installId });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.serviceType.name).toBe("Install");
    expect(accepted.body.data.priority).toBe("HIGH");

    const seen = await request(app).get(`/api/v1/service-requests/${requestId}`).set(auth(ownerToken));
    expect(seen.body.data.status).toBe("ACCEPTED");
    expect(seen.body.data.workOrder.status).toBe("OPEN");
    expect(seen.body.data.workOrder.visits).toEqual([]);

    const again = await request(app).post(`/api/v1/service-requests/${requestId}/accept`).set(auth(opsToken)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects an unknown service type", async () => {
    const { opsToken, requestId } = await submittedRequest();
    const accepted = await request(app)
      .post(`/api/v1/service-requests/${requestId}/accept`)
      .set(auth(opsToken))
      .send({ serviceTypeId: "missing" });
    expect(accepted.status).toBe(404);
    expect(accepted.body.error.code).toBe("SERVICE_TYPE_NOT_FOUND");
  });
});
