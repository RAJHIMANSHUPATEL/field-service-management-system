import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { app, createApp } from "../server.js";
import { resetDatabase } from "../test/resetDatabase.js";
import { auth, login, password, scheduledJob, seedStaff, setup } from "../test/jobFixtures.js";
import { operations } from "./openapi.js";

const api = (path: string) => `/api/v1${path}`;

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterEach(() => {
  delete process.env.RATE_LIMIT_AUTH;
  delete process.env.RATE_LIMIT_API;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("API documentation", () => {
  it("documents every route defined in the code, with roles and request schemas", async () => {
    const modules = join(import.meta.dirname, "../modules");
    let defined = 0;
    for (const dir of readdirSync(modules, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
      for (const file of readdirSync(join(modules, dir)).filter((name) => name.endsWith(".routes.ts"))) {
        defined += readFileSync(join(modules, dir, file), "utf8").match(/Router\.(get|post|patch|put|delete)\(/g)?.length ?? 0;
      }
    }
    const ops = operations();
    expect(ops.length).toBe(defined);
    const response = await request(app).get(api("/openapi.json"));
    expect(response.status).toBe(200);
    const paths = response.body.paths as Record<string, Record<string, { requestBody?: unknown; description: string; security: unknown[] }>>;
    const documented = Object.values(paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0);
    expect(documented).toBe(defined);
    expect(paths["/api/v1/work-orders/{id}/assign"]!.post!.requestBody).toBeDefined();
    expect(paths["/api/v1/work-orders/{id}/assign"]!.post!.description).toBe("Roles: ADMIN, OPS.");
    expect(paths["/api/v1/auth/login"]!.post!.security).toEqual([]);
    expect(paths["/api/v1/invoices/{id}/payments"]!.post!.requestBody).toBeDefined();
    // Every controller that parses a body exposes it in the document.
    const bodies = Object.values(paths).flatMap((methods) => Object.values(methods)).filter((op) => op.requestBody).length;
    expect(bodies).toBeGreaterThanOrEqual(45);
  });
});

describe("idempotency", () => {
  it("replays a retried POST instead of repeating it", async () => {
    const admin = await login("admin@example.com");
    const first = await request(app).post(api("/customers")).set(auth(admin)).set("Idempotency-Key", "k-1").send({ name: "Once" });
    const retry = await request(app).post(api("/customers")).set(auth(admin)).set("Idempotency-Key", "k-1").send({ name: "Once" });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await prisma.customer.count({ where: { name: "Once" } })).toBe(1);

    const reused = await request(app).post(api("/customers")).set(auth(admin)).set("Idempotency-Key", "k-1").send({ name: "Other" });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    // Keys are per user: someone else's same key is a new request.
    const ops = await login("ops@example.com");
    const theirs = await request(app).post(api("/customers")).set(auth(ops)).set("Idempotency-Key", "k-1").send({ name: "Once" });
    expect(theirs.headers["idempotent-replayed"]).toBeUndefined();
    expect(await prisma.customer.count({ where: { name: "Once" } })).toBe(2);
  });

  it("replays errors too, so a retried illegal transition still answers 409", async () => {
    const context = await setup();
    const job = await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z");
    const tara = await login("tara@example.com");
    const once = await request(app).post(api(`/work-orders/${job.workOrderId}/accept`)).set(auth(tara)).set("Idempotency-Key", "acc");
    const twice = await request(app).post(api(`/work-orders/${job.workOrderId}/accept`)).set(auth(tara)).set("Idempotency-Key", "acc");
    expect(once.status).toBe(409);
    expect(twice.status).toBe(409);
    expect(twice.headers["idempotent-replayed"]).toBe("true");
  });
});

describe("rate limiting", () => {
  it("limits sign-in attempts per address and email with 429 and Retry-After", async () => {
    process.env.RATE_LIMIT_AUTH = "3";
    const limited = createApp();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await request(limited).post(api("/auth/login")).send({ email: "ops@example.com", password: "wrong-password" })).status).toBe(401);
    }
    const blocked = await request(limited).post(api("/auth/login")).send({ email: "ops@example.com", password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // A different account from the same address is not blocked.
    expect((await request(limited).post(api("/auth/login")).send({ email: "admin@example.com", password })).status).toBe(200);
  });

  it("limits all API calls per address", async () => {
    process.env.RATE_LIMIT_API = "2";
    const limited = createApp();
    expect((await request(limited).get(api("/auth/me"))).status).toBe(401);
    expect((await request(limited).get(api("/auth/me"))).status).toBe(401);
    const third = await request(limited).get(api("/auth/me"));
    expect(third.status).toBe(429);
    expect(third.headers["ratelimit-limit"]).toBe("2");
    expect((await request(limited).get("/health")).status).toBe(200);
  });
});

describe("mobile readiness", () => {
  it("gives native clients the refresh token in the body and accepts it back", async () => {
    const web = await request(app).post(api("/auth/login")).send({ email: "ops@example.com", password });
    expect(web.body.data.refreshToken).toBeUndefined();
    const mobile = await request(app).post(api("/auth/login")).set("X-Client", "mobile").send({ email: "ops@example.com", password });
    const refreshToken = mobile.body.data.refreshToken as string;
    expect(refreshToken).toBeTruthy();
    const refreshed = await request(app).post(api("/auth/refresh")).set("X-Client", "mobile").send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(refreshToken);
    const out = await request(app).post(api("/auth/logout")).send({ refreshToken: refreshed.body.data.refreshToken });
    expect(out.status).toBe(204);
    const after = await request(app).post(api("/auth/refresh")).send({ refreshToken: refreshed.body.data.refreshToken });
    expect(after.status).toBe(401);
  });

  it("syncs the technician's changed jobs since the last sync", async () => {
    const context = await setup();
    const job = await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z", false);
    const tara = await login("tara@example.com");
    const full = await request(app).get(api("/sync/technician")).set(auth(tara));
    expect(full.status).toBe(200);
    expect(full.body.data.full).toBe(true);
    expect(full.body.data.workOrders.map((row: { id: string }) => row.id)).toEqual([job.workOrderId]);
    const since = full.body.data.serverTime as string;
    const none = await request(app).get(api(`/sync/technician?since=${since}`)).set(auth(tara));
    expect(none.body.data.workOrders).toEqual([]);
    await request(app).post(api(`/work-orders/${job.workOrderId}/accept`)).set(auth(tara));
    const delta = await request(app).get(api(`/sync/technician?since=${since}`)).set(auth(tara));
    expect(delta.body.data.workOrders.map((row: { id: string; status: string }) => [row.id, row.status])).toEqual([[job.workOrderId, "ACCEPTED"]]);
    const sam = await login("sam@example.com");
    expect((await request(app).get(api("/sync/technician")).set(auth(sam))).body.data.workOrders).toEqual([]);
    expect((await request(app).get(api("/sync/technician")).set(auth(context.opsToken))).status).toBe(403);
    expect((await request(app).get(api("/sync/technician?since=yesterday")).set(auth(tara))).status).toBe(400);
  });

  it("paginates the invoice list", async () => {
    const ops = await login("ops@example.com");
    const page = await request(app).get(api("/invoices?limit=5")).set(auth(ops));
    expect(page.body.meta).toMatchObject({ page: 1, limit: 5, total: 0 });
    expect((await request(app).get(api("/invoices?limit=500")).set(auth(ops))).status).toBe(400);
  });
});
