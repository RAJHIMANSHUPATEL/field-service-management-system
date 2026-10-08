import argon2 from "argon2";
import request from "supertest";
import { expect } from "vitest";
import { prisma } from "../lib/prisma.js";
import { app } from "../server.js";

// Shared job fixtures: an org with admin and ops, technicians with skills and areas, a customer
// contact, and helpers that drive a request to an assigned, scheduled and accepted work order.
export const password = "Password123!";
let passwordHash: string | undefined;

export async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export type Setup = Awaited<ReturnType<typeof setup>>;

export async function setup() {
  const adminToken = await login("admin@example.com");
  const opsToken = await login("ops@example.com");
  const skill = await request(app).post("/api/v1/skills").set(auth(adminToken)).send({ name: "Boilers" });
  const area = await request(app)
    .post("/api/v1/service-areas")
    .set(auth(adminToken))
    .send({ name: "East", postalCodes: ["78702"] });
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
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "78702",
  });
  const serviceType = await request(app)
    .post("/api/v1/service-types")
    .set(auth(adminToken))
    .send({ name: "Repair", requiredSkillId: skill.body.data.id });
  expect(serviceType.status).toBe(201);
  const technicians: Record<string, string> = {};
  for (const name of ["tara", "sam", "nia"]) {
    const created = await request(app)
      .post("/api/v1/technicians")
      .set(auth(adminToken))
      .send({ name, email: `${name}@example.com`, password });
    technicians[name] = created.body.data.id as string;
  }
  await request(app)
    .patch(`/api/v1/technicians/${technicians.tara}`)
    .set(auth(adminToken))
    .send({ skillIds: [skill.body.data.id], serviceAreaIds: [area.body.data.id] });
  await request(app)
    .patch(`/api/v1/technicians/${technicians.sam}`)
    .set(auth(adminToken))
    .send({ skillIds: [skill.body.data.id] });
  const ownerToken = await login("owner@example.com");
  let serial = 0;

  async function workOrder() {
    serial += 1;
    const asset = await request(app).post("/api/v1/assets").set(auth(adminToken)).send({
      customerId,
      addressId: address.body.data.id,
      equipmentType: "Boiler",
      model: "Heat 1",
      serialNumber: `B-${serial}`,
    });
    const created = await request(app).post("/api/v1/service-requests").set(auth(ownerToken)).send({
      assetId: asset.body.data.id,
      serviceTypeId: serviceType.body.data.id,
      description: "No heat",
      preferredStart: "2026-11-02",
      preferredEnd: "2026-11-04",
    });
    const accepted = await request(app)
      .post(`/api/v1/service-requests/${created.body.data.id as string}/accept`)
      .set(auth(opsToken))
      .send({});
    return accepted.body.data.workOrder.id as string;
  }

  return { adminToken, opsToken, ownerToken, technicians, workOrder };
}

export async function scheduledJob(context: Setup, technician: string, scheduledStart: string, accept = true) {
  const id = await context.workOrder();
  const assigned = await request(app)
    .post(`/api/v1/work-orders/${id}/assign`)
    .set(auth(context.opsToken))
    .send({ technicianId: context.technicians[technician] });
  expect(assigned.status).toBe(200);
  const scheduled = await request(app)
    .post(`/api/v1/work-orders/${id}/schedule`)
    .set(auth(context.opsToken))
    .send({ scheduledStart });
  expect(scheduled.status).toBe(200);
  if (accept) {
    const token = await login(`${technician}@example.com`);
    const accepted = await request(app).post(`/api/v1/work-orders/${id}/accept`).set(auth(token));
    expect(accepted.status).toBe(200);
  }
  return { workOrderId: id, visitId: scheduled.body.data.visits[0].id as string };
}


export async function hashedPassword() {
  passwordHash ??= await argon2.hash(password);
  return passwordHash;
}

export async function seedStaff() {
  const passwordHash = await hashedPassword();

  const organization = await prisma.organization.create({ data: { name: "Plan Co", gstState: "29" } });
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
}
