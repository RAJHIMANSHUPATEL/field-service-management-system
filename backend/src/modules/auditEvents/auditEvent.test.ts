import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";

const password = "Password123!";
let passwordHash: string;

async function token(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return { Authorization: `Bearer ${response.body.data.accessToken as string}` };
}

beforeAll(async () => {
  passwordHash = await argon2.hash(password);
});

beforeEach(async () => {
  await resetDatabase();
  for (const [org, email, role] of [
    ["Audit Co", "admin@example.com", "ADMIN"],
    ["Audit Co", "ops@example.com", "OPS"],
    ["Other Co", "other@example.com", "ADMIN"],
  ] as const) {
    const organization =
      (await prisma.organization.findFirst({ where: { name: org } })) ??
      (await prisma.organization.create({ data: { name: org } }));
    await prisma.user.create({ data: { organizationId: organization.id, email, name: email, role, passwordHash } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("audit events", () => {
  it("records successful mutations with actor and entity, and skips failures and reads", async () => {
    const ops = await token("ops@example.com");
    const created = await request(app).post("/api/v1/customers").set(ops).send({ name: "Logged Co" });
    expect(created.status).toBe(201);
    const customerId = created.body.data.id as string;
    await request(app).patch(`/api/v1/customers/${customerId}`).set(ops).send({ name: "Logged Co 2" });
    await request(app).post("/api/v1/customers").set(ops).send({});
    await request(app).get("/api/v1/customers").set(ops);

    const admin = await token("admin@example.com");
    const events = await request(app).get(`/api/v1/audit-events?entityId=${customerId}`).set(admin);
    expect(events.status).toBe(200);
    const actions = events.body.data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(["customers.update", "customers.create"]);
    expect(events.body.data[0].actor.name).toBe("ops@example.com");

    const all = await request(app).get("/api/v1/audit-events?limit=100").set(admin);
    const allActions = all.body.data.map((e: { action: string }) => e.action);
    expect(allActions.filter((a: string) => a === "auth.login")).toHaveLength(2);
    expect(allActions).not.toContain("customers.list");
    expect(all.body.data.every((e: { status: number }) => e.status < 400)).toBe(true);
  });

  it("is limited to admins of the same organization", async () => {
    const ops = await token("ops@example.com");
    const forbidden = await request(app).get("/api/v1/audit-events").set(ops);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");

    const other = await token("other@example.com");
    const otherEvents = await request(app).get("/api/v1/audit-events?limit=100").set(other);
    expect(otherEvents.status).toBe(200);
    expect(otherEvents.body.data.every((e: { actor: { name: string } }) => e.actor.name === "other@example.com")).toBe(true);
  });
});
