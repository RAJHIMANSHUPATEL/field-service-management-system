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
  const organization = await prisma.organization.create({ data: { name: "Master Data Co" } });
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("master data", () => {
  it("lets an admin create a customer, contact, address, asset, service type, and technician", async () => {
    const token = await login("admin@example.com");

    const customer = await request(app)
      .post("/api/v1/customers")
      .set(auth(token))
      .send({ name: "North Tower", phone: "555-1000" });
    expect(customer.status).toBe(201);
    const customerId = customer.body.data.id as string;

    const contact = await request(app)
      .post(`/api/v1/customers/${customerId}/contacts`)
      .set(auth(token))
      .send({
        name: "Nina North",
        email: "nina@example.com",
        password,
      });
    expect(contact.status).toBe(201);
    expect(contact.body.data.hasLogin).toBe(true);

    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth(token))
      .send({
        label: "Lobby",
        line1: "1 North Ave",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
      });
    expect(address.status).toBe(201);
    expect(address.body.data.isPrimary).toBe(true);

    const asset = await request(app)
      .post("/api/v1/assets")
      .set(auth(token))
      .send({
        customerId,
        addressId: address.body.data.id,
        equipmentType: "Air conditioner",
        model: "CoolAir 2400",
        serialNumber: "AC-2002",
        warrantyExpiresAt: "2027-06-01",
      });
    expect(asset.status).toBe(201);
    expect(asset.body.data.serialNumber).toBe("AC-2002");

    const serviceType = await request(app)
      .post("/api/v1/service-types")
      .set(auth(token))
      .send({ name: "Repair", description: "Fix the unit" });
    expect(serviceType.status).toBe(201);
    expect(serviceType.body.data.name).toBe("Repair");

    const technician = await request(app)
      .post("/api/v1/technicians")
      .set(auth(token))
      .send({
        name: "Theo Tech",
        email: "theo@example.com",
        password,
        phone: "555-2222",
      });
    expect(technician.status).toBe(201);
    expect(technician.body.data.user.role).toBe("TECHNICIAN");
  });

  it("lets a customer read their own asset and hides another customer's asset", async () => {
    const adminToken = await login("admin@example.com");

    async function createOwnedAsset(name: string, email: string, serialNumber: string) {
      const customer = await request(app)
        .post("/api/v1/customers")
        .set(auth(adminToken))
        .send({ name });
      const customerId = customer.body.data.id as string;
      await request(app).post(`/api/v1/customers/${customerId}/contacts`).set(auth(adminToken)).send({
        name,
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
      const asset = await request(app).post("/api/v1/assets").set(auth(adminToken)).send({
        customerId,
        addressId: address.body.data.id,
        equipmentType: "Boiler",
        model: "Heat 1",
        serialNumber,
      });
      return asset.body.data.id as string;
    }

    const ownAssetId = await createOwnedAsset("Own Site", "owner@example.com", "OWN-1");
    const otherAssetId = await createOwnedAsset("Other Site", "other@example.com", "OTHER-1");

    const customerToken = await login("owner@example.com");
    const own = await request(app).get(`/api/v1/assets/${ownAssetId}`).set(auth(customerToken));
    expect(own.status).toBe(200);
    expect(own.body.data.serialNumber).toBe("OWN-1");

    const other = await request(app).get(`/api/v1/assets/${otherAssetId}`).set(auth(customerToken));
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a technician creating a customer", async () => {
    const adminToken = await login("admin@example.com");
    await request(app).post("/api/v1/technicians").set(auth(adminToken)).send({
      name: "Blocked Tech",
      email: "blocked@example.com",
      password,
    });

    const technicianToken = await login("blocked@example.com");
    const response = await request(app)
      .post("/api/v1/customers")
      .set(auth(technicianToken))
      .send({ name: "Should fail" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
