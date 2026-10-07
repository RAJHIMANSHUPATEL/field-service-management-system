import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, hashedPassword, login, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";
import { nextLevel } from "./inventory.ledger.js";
import { canMoveVisitPart, stockEffect } from "./visitPart.transitions.js";

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const api = (path: string) => `/api/v1${path}`;

async function stockSetup() {
  const context = await setup();
  const ops = context.opsToken;
  const part = await request(app).post(api("/parts")).set(auth(ops)).send({ sku: "ign-1", name: "Igniter", unitPrice: "450.00" });
  expect(part.status).toBe(201);
  const central = await request(app).post(api("/warehouses")).set(auth(ops)).send({ name: "Central" });
  const van = await request(app)
    .post(api("/warehouses"))
    .set(auth(ops))
    .send({ name: "Tara van", kind: "VAN", technicianId: context.technicians.tara });
  expect(van.status).toBe(201);
  const ids = { partId: part.body.data.id as string, centralId: central.body.data.id as string, vanId: van.body.data.id as string };
  const received = await request(app)
    .post(api("/inventory/receipts"))
    .set(auth(ops))
    .send({ warehouseId: ids.centralId, partId: ids.partId, quantity: 10, reason: "PO 1001" });
  expect(received.status).toBe(201);
  const moved = await request(app)
    .post(api("/inventory/transfers"))
    .set(auth(ops))
    .send({ fromWarehouseId: ids.centralId, toWarehouseId: ids.vanId, partId: ids.partId, quantity: 4, reason: "Van restock" });
  expect(moved.status).toBe(201);
  expect(moved.body.data.map((row: { kind: string }) => row.kind)).toEqual(["TRANSFER_OUT", "TRANSFER_IN"]);
  return { context, ...ids };
}

async function level(warehouseId: string, partId: string) {
  return prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_partId: { warehouseId, partId } } });
}

describe("stock rules", () => {
  it("never lets on-hand or reserved go negative, or reserved exceed on-hand", () => {
    expect(nextLevel({ onHand: 4, reserved: 0 }, 0, 2)).toEqual({ onHand: 4, reserved: 2 });
    expect(nextLevel({ onHand: 4, reserved: 2 }, -2, -2)).toEqual({ onHand: 2, reserved: 0 });
    expect(nextLevel({ onHand: 4, reserved: 2 }, -3, 0)).toBeNull();
    expect(nextLevel({ onHand: 4, reserved: 0 }, 0, 5)).toBeNull();
    expect(nextLevel({ onHand: 1, reserved: 0 }, -2, 0)).toBeNull();
    expect(stockEffect("consume", 2)).toEqual({ onHandDelta: -2, reservedDelta: -2 });
    expect(stockEffect("release", 2)).toEqual({ onHandDelta: 0, reservedDelta: -2 });
    expect(stockEffect("return", 2)).toEqual({ onHandDelta: 2, reservedDelta: 0 });
    expect(canMoveVisitPart("consume", "RESERVED")).toBe(true);
    expect(canMoveVisitPart("consume", "CONSUMED")).toBe(false);
    expect(canMoveVisitPart("return", "RESERVED")).toBe(false);
  });
});

describe("inventory", () => {
  it("decrements the technician's van when a part is used on a visit, and records every step in the ledger", async () => {
    const { context, partId, centralId, vanId } = await stockSetup();
    const { visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const tara = await login("tara@example.com");
    await request(app).post(api(`/visits/${visitId}/en-route`)).set(auth(tara));
    await request(app).post(api(`/visits/${visitId}/arrive`)).set(auth(tara));

    // Reserve at diagnosis: two to use, one spare that is not needed.
    const reserved = await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId, quantity: 2 });
    expect(reserved.status).toBe(201);
    const spare = await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId, quantity: 1 });
    expect(spare.status).toBe(201);
    expect(await level(vanId, partId)).toMatchObject({ onHand: 4, reserved: 3 });
    const tooMany = await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId, quantity: 2 });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { available: 1 } });

    const [used, extra] = spare.body.data.visits[0].parts as { id: string }[];
    // Using a part needs the work to have started.
    const early = await request(app).post(api(`/visits/${visitId}/parts/${used!.id}/consume`)).set(auth(tara));
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("INVALID_TRANSITION");

    await request(app).post(api(`/visits/${visitId}/start`)).set(auth(tara));
    const consumed = await request(app).post(api(`/visits/${visitId}/parts/${used!.id}/consume`)).set(auth(tara));
    expect(consumed.status).toBe(200);
    expect(consumed.body.data.visits[0].parts[0]).toMatchObject({ status: "CONSUMED", quantity: 2, unitPrice: "450", currency: "INR" });
    expect(await level(vanId, partId)).toMatchObject({ onHand: 2, reserved: 1 });
    expect(await level(centralId, partId)).toMatchObject({ onHand: 6, reserved: 0 });
    const twice = await request(app).post(api(`/visits/${visitId}/parts/${used!.id}/consume`)).set(auth(tara));
    expect(twice.status).toBe(409);
    expect((await request(app).post(api(`/visits/${visitId}/parts/${used!.id}/release`)).set(auth(tara))).status).toBe(409);

    // Finish the job: the unused spare is released automatically.
    await request(app).patch(api(`/visits/${visitId}/report`)).set(auth(tara)).send({ workPerformed: "Replaced igniter" });
    await request(app)
      .post(api(`/visits/${visitId}/signature`))
      .set(auth(tara))
      .send({
        signerName: "Owner",
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      });
    const done = await request(app).post(api(`/visits/${visitId}/complete`)).set(auth(tara));
    expect(done.status).toBe(200);
    expect(done.body.data.visits[0].parts.find((row: { id: string }) => row.id === extra!.id).status).toBe("RELEASED");
    expect(await level(vanId, partId)).toMatchObject({ onHand: 2, reserved: 0 });

    const ledger = await request(app).get(api(`/inventory/movements?visitId=${visitId}`)).set(auth(context.opsToken));
    expect(ledger.status).toBe(200);
    const rows = (ledger.body.data as { kind: string; onHandDelta: number; reason: string; actor: { name: string }; warehouse: { id: string } }[]).reverse();
    expect(rows.map((row) => row.kind)).toEqual(["RESERVED", "RESERVED", "CONSUMED", "RELEASED"]);
    expect(rows[2]).toMatchObject({ onHandDelta: -2, reason: "Used on the visit", actor: { name: "tara" }, warehouse: { id: vanId } });
    for (const row of rows) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
    // Movements are also audited.
    const audit = await prisma.auditEvent.findMany({ where: { action: { in: ["visits.parts.consume", "inventory.transfers"] } } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("returns a used part to the van with a reason", async () => {
    const { context, partId, vanId } = await stockSetup();
    const { visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const tara = await login("tara@example.com");
    for (const step of ["en-route", "arrive", "start"]) {
      await request(app).post(api(`/visits/${visitId}/${step}`)).set(auth(tara));
    }
    const added = await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId, quantity: 1 });
    const id = added.body.data.visits[0].parts[0].id as string;
    expect((await request(app).post(api(`/visits/${visitId}/parts/${id}/return`)).set(auth(tara)).send({ reason: "Unused" })).status).toBe(409);
    await request(app).post(api(`/visits/${visitId}/parts/${id}/consume`)).set(auth(tara));
    expect((await request(app).post(api(`/visits/${visitId}/parts/${id}/return`)).set(auth(tara)).send({})).status).toBe(400);
    const returned = await request(app).post(api(`/visits/${visitId}/parts/${id}/return`)).set(auth(tara)).send({ reason: "Wrong size" });
    expect(returned.status).toBe(200);
    expect(await level(vanId, partId)).toMatchObject({ onHand: 4, reserved: 0 });
    const last = await prisma.stockMovement.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(last).toMatchObject({ kind: "RETURNED", onHandDelta: 1, reason: "Wrong size" });
  });

  it("rejects moves that would break stock, and adjusts with a reason", async () => {
    const { context, partId, centralId, vanId } = await stockSetup();
    const ops = context.opsToken;
    const overdraw = await request(app)
      .post(api("/inventory/transfers"))
      .set(auth(ops))
      .send({ fromWarehouseId: vanId, toWarehouseId: centralId, partId, quantity: 5, reason: "Back" });
    expect(overdraw.status).toBe(409);
    expect(overdraw.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await level(centralId, partId)).toMatchObject({ onHand: 6 });
    const same = await request(app)
      .post(api("/inventory/transfers"))
      .set(auth(ops))
      .send({ fromWarehouseId: vanId, toWarehouseId: vanId, partId, quantity: 1, reason: "x" });
    expect(same.status).toBe(400);
    const negative = await request(app)
      .post(api("/inventory/adjustments"))
      .set(auth(ops))
      .send({ warehouseId: vanId, partId, quantityDelta: -5, reason: "Count" });
    expect(negative.status).toBe(409);
    const counted = await request(app)
      .post(api("/inventory/adjustments"))
      .set(auth(ops))
      .send({ warehouseId: vanId, partId, quantityDelta: -1, reason: "Cycle count" });
    expect(counted.status).toBe(201);
    expect(counted.body.data).toMatchObject({ kind: "ADJUSTED", onHandDelta: -1, reason: "Cycle count" });
    expect((await request(app).post(api("/inventory/adjustments")).set(auth(ops)).send({ warehouseId: vanId, partId, quantityDelta: 0, reason: "x" })).status).toBe(400);
    expect((await request(app).post(api("/inventory/receipts")).set(auth(ops)).send({ warehouseId: vanId, partId, quantity: 1 })).status).toBe(400);
    const stock = await request(app).get(api("/inventory/stock")).set(auth(ops));
    expect(stock.body.data).toHaveLength(2);
    expect(stock.body.data.find((row: { warehouse: { id: string } }) => row.warehouse.id === vanId)).toMatchObject({ onHand: 3, available: 3 });
  });

  it("keeps technicians to their own van and other orgs out", async () => {
    const { context, partId, centralId, vanId } = await stockSetup();
    const tara = await login("tara@example.com");
    const sam = await login("sam@example.com");
    for (const token of [tara, context.ownerToken]) {
      const denied = await request(app)
        .post(api("/inventory/receipts"))
        .set(auth(token))
        .send({ warehouseId: centralId, partId, quantity: 1, reason: "x" });
      expect(denied.status).toBe(403);
    }
    expect((await request(app).get(api("/inventory/stock")).set(auth(context.ownerToken))).status).toBe(403);
    const own = await request(app).get(api("/inventory/stock")).set(auth(tara));
    expect(own.body.data.map((row: { warehouse: { id: string } }) => row.warehouse.id)).toEqual([vanId]);
    expect((await request(app).get(api("/inventory/stock")).set(auth(sam))).body.data).toEqual([]);

    const { visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    await request(app).post(api(`/visits/${visitId}/en-route`)).set(auth(tara));
    expect((await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId, quantity: 1 })).status).toBe(409);
    await request(app).post(api(`/visits/${visitId}/arrive`)).set(auth(tara));
    expect((await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(sam)).send({ partId, quantity: 1 })).status).toBe(403);
    expect((await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(context.opsToken)).send({ partId, quantity: 1 })).status).toBe(403);
    expect((await request(app).post(api(`/visits/${visitId}/parts`)).set(auth(tara)).send({ partId: "missing", quantity: 1 })).status).toBe(404);

    const passwordHash = await hashedPassword();
    const other = await prisma.organization.create({ data: { name: "Other" } });
    await prisma.user.create({ data: { organizationId: other.id, email: "x@other.example", name: "X", role: "OPS", passwordHash } });
    const outsider = await login("x@other.example");
    const foreign = await request(app)
      .post(api("/inventory/receipts"))
      .set(auth(outsider))
      .send({ warehouseId: centralId, partId, quantity: 1, reason: "x" });
    expect(foreign.status).toBe(404);
    expect((await request(app).get(api("/inventory/movements")).set(auth(outsider))).body.data).toEqual([]);
  });
});
