import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveGstState } from "../../lib/gstStates.js";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, seedStaff, setup } from "../../test/jobFixtures.js";

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GST state lookup", () => {
  it("accepts a code, an abbreviation or a name, case-insensitively", () => {
    for (const value of ["29", "KA", "ka", "Karnataka", "  KARNATAKA "]) {
      expect(resolveGstState(value)?.code).toBe("29");
    }
    expect(resolveGstState("9")?.name).toBe("Uttar Pradesh");
    expect(resolveGstState("Jammu & Kashmir")?.code).toBe("01");
    expect(resolveGstState("Orissa")?.code).toBe("21");
    expect(resolveGstState("TG")?.code).toBe("36");
    expect(resolveGstState("Telangana")?.code).toBe("36");
    expect(resolveGstState("Daman and Diu")?.code).toBe("26");
    for (const value of ["TX", "Texas", "", "28", "Bengaluru", null]) {
      expect(resolveGstState(value)).toBeNull();
    }
  });
});

describe("organisation settings", () => {
  it("lets an admin set the GST state by code, abbreviation or name, and audits it", async () => {
    const admin = await login("admin@example.com");
    const current = await request(app).get("/api/v1/organization").set(auth(admin));
    expect(current.status).toBe(200);
    expect(current.body.data).toMatchObject({ name: "Plan Co", gstState: "29", gstStateName: "Karnataka", taxRatePercent: "18" });

    const byName = await request(app).patch("/api/v1/organization").set(auth(admin)).send({ gstState: "maharashtra" });
    expect(byName.status).toBe(200);
    expect(byName.body.data).toMatchObject({ gstState: "27", gstStateName: "Maharashtra" });
    expect((await request(app).patch("/api/v1/organization").set(auth(admin)).send({ gstState: "TS" })).body.data.gstState).toBe("36");
    expect((await request(app).patch("/api/v1/organization").set(auth(admin)).send({ gstState: "29" })).body.data.gstState).toBe("29");

    const bad = await request(app).patch("/api/v1/organization").set(auth(admin)).send({ gstState: "Texas" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    expect((await prisma.organization.findFirstOrThrow()).gstState).toBe("29");

    const events = await prisma.auditEvent.findMany({ where: { action: "organization.update" } });
    expect(events).toHaveLength(3);

    const states = await request(app).get("/api/v1/organization/gst-states").set(auth(admin));
    expect(states.body.data).toContainEqual({ code: "29", abbreviation: "KA", name: "Karnataka" });
  });

  it("lets ops read but not change it, and hides it from technicians and customers", async () => {
    const context = await setup();
    const tara = await login("tara@example.com");
    expect((await request(app).get("/api/v1/organization").set(auth(context.opsToken))).status).toBe(200);
    expect((await request(app).patch("/api/v1/organization").set(auth(context.opsToken)).send({ gstState: "27" })).status).toBe(403);
    expect((await request(app).get("/api/v1/organization").set(auth(tara))).status).toBe(403);
    expect((await request(app).get("/api/v1/organization").set(auth(context.ownerToken))).status).toBe(403);
    expect((await prisma.organization.findFirstOrThrow()).gstState).toBe("29");
  });
});
