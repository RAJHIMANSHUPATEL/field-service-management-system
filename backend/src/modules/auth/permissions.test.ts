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
  const organization = await prisma.organization.create({ data: { name: "Matrix Co" } });
  for (const [email, role] of [
    ["admin@example.com", "ADMIN"],
    ["ops@example.com", "OPS"],
  ] as const) {
    await prisma.user.create({ data: { organizationId: organization.id, email, name: email, role, passwordHash } });
  }
  const admin = await token("admin@example.com");
  for (const name of ["Cara Co", "Dan Co"]) {
    const customer = await request(app).post("/api/v1/customers").set(admin).send({ name });
    await request(app)
      .post(`/api/v1/customers/${customer.body.data.id as string}/contacts`)
      .set(admin)
      .send({ name, email: `${name.split(" ")[0]?.toLowerCase()}@example.com`, password });
  }
  for (const name of ["Tara", "Sam"]) {
    await request(app)
      .post("/api/v1/technicians")
      .set(admin)
      .send({ name, email: `${name.toLowerCase()}@example.com`, password });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Row = [path: string, admin: number, ops: number, technician: number, customer: number];

// Mirrors docs/permissions.md. Each role signs in and gets exactly the access in its column.
const matrix: Row[] = [
  ["/api/v1/customers", 200, 200, 403, 200],
  ["/api/v1/assets", 200, 200, 403, 200],
  ["/api/v1/service-types", 200, 200, 403, 200],
  ["/api/v1/service-requests", 200, 200, 403, 200],
  ["/api/v1/technicians", 200, 200, 200, 403],
  ["/api/v1/work-orders", 200, 200, 200, 403],
  ["/api/v1/users", 200, 403, 403, 403],
  ["/api/v1/audit-events", 200, 403, 403, 403],
];

describe("permission matrix", () => {
  it("lets all four roles sign in and see only what their role permits", async () => {
    const sessions = {
      admin: await token("admin@example.com"),
      ops: await token("ops@example.com"),
      technician: await token("tara@example.com"),
      customer: await token("cara@example.com"),
    };
    for (const [path, ...expected] of matrix) {
      const roles = [sessions.admin, sessions.ops, sessions.technician, sessions.customer];
      for (const [index, headers] of roles.entries()) {
        const response = await request(app).get(path).set(headers);
        expect({ path, index, status: response.status }).toEqual({ path, index, status: expected[index] });
      }
    }
  });

  it("scopes a customer to their own company and a technician to their own profile", async () => {
    const customer = await token("cara@example.com");
    const customers = await request(app).get("/api/v1/customers").set(customer);
    expect(customers.body.data.map((c: { name: string }) => c.name)).toEqual(["Cara Co"]);

    const technician = await token("tara@example.com");
    const technicians = await request(app).get("/api/v1/technicians").set(technician);
    expect(technicians.body.data.map((t: { user: { name: string } }) => t.user.name)).toEqual(["Tara"]);
    const jobs = await request(app).get("/api/v1/work-orders").set(technician);
    expect(jobs.body.data).toEqual([]);
  });

  it("rejects writes outside the role", async () => {
    const customer = await token("cara@example.com");
    expect((await request(app).post("/api/v1/customers").set(customer).send({ name: "X" })).status).toBe(403);
    const technician = await token("tara@example.com");
    expect((await request(app).post("/api/v1/service-types").set(technician).send({ name: "X" })).status).toBe(403);
    const ops = await token("ops@example.com");
    expect(
      (await request(app).post("/api/v1/users/invitations").set(ops).send({ email: "a@b.co", name: "A", role: "OPS" }))
        .status,
    ).toBe(403);
  });
});
