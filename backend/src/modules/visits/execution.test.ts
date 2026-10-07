import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";

// 1x1 transparent PNG.
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const png = Buffer.from(pngBase64, "base64");
const signature = { signerName: "Olga Owner", image: `data:image/png;base64,${pngBase64}` };

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function startedJob() {
  const context = await setup();
  const job = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
  const tara = await login("tara@example.com");
  for (const step of ["en-route", "arrive"]) {
    const moved = await request(app).post(`/api/v1/visits/${job.visitId}/${step}`).set(auth(tara));
    expect(moved.status).toBe(200);
  }
  return { context, tara, ...job };
}

function post(path: string, token: string) {
  return request(app).post(`/api/v1${path}`).set(auth(token));
}

describe("technician execution", () => {
  it("drives a visit from arrival to COMPLETED with diagnosis, photo, notes, signature and timestamps", async () => {
    const { context, tara, visitId, workOrderId } = await startedJob();

    const diagnosis = await request(app)
      .patch(`/api/v1/visits/${visitId}/report`)
      .set(auth(tara))
      .send({ diagnosis: "Ignition electrode worn" });
    expect(diagnosis.status).toBe(200);

    const photo = await post(`/visits/${visitId}/photos`, tara)
      .set("Content-Type", "image/png")
      .set("X-File-Name", "electrode.png")
      .set("X-Caption", "Worn electrode")
      .send(png);
    expect(photo.status).toBe(201);
    expect(photo.body.data).toMatchObject({ fileName: "electrode.png", caption: "Worn electrode" });

    expect((await post(`/visits/${visitId}/start`, tara)).status).toBe(200);
    const note = await post(`/work-orders/${workOrderId}/notes`, tara).send({ body: "Customer asked for a quote" });
    expect(note.status).toBe(201);
    expect(note.body.data.notes.at(-1)).toMatchObject({ body: "Customer asked for a quote" });

    // Completion needs the work performed and a signature.
    const early = await post(`/visits/${visitId}/complete`, tara);
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({ code: "INVALID_TRANSITION", details: { missing: ["workPerformed", "signature"] } });

    await request(app)
      .patch(`/api/v1/visits/${visitId}/report`)
      .set(auth(tara))
      .send({ workPerformed: "Replaced electrode, tested burner" });
    const signed = await post(`/visits/${visitId}/signature`, tara).send(signature);
    expect(signed.status).toBe(200);
    expect(signed.body.data.visits[0]).toMatchObject({ signerName: "Olga Owner" });

    const done = await post(`/visits/${visitId}/complete`, tara);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("COMPLETED");
    const visit = done.body.data.visits[0];
    expect(visit.status).toBe("COMPLETED");
    for (const stamp of ["enRouteAt", "arrivedAt", "startedAt", "completedAt", "signedAt"]) {
      expect(visit[stamp]).toEqual(expect.any(String));
    }

    // The customer sees every step on the request.
    const requestId = done.body.data.request.id as string;
    const view = await request(app).get(`/api/v1/service-requests/${requestId}`).set(auth(context.ownerToken));
    expect(view.body.data.workOrder.status).toBe("COMPLETED");
    expect(view.body.data.workOrder.visits[0]).toMatchObject({
      status: "COMPLETED",
      diagnosis: "Ignition electrode worn",
      workPerformed: "Replaced electrode, tested burner",
      signerName: "Olga Owner",
      photos: [{ fileName: "electrode.png", caption: "Worn electrode" }],
    });
    const photoUrl = await request(app)
      .get(`/api/v1/visits/${visitId}/photos/${photo.body.data.id as string}`)
      .set(auth(context.ownerToken));
    expect(photoUrl.status).toBe(200);
    expect(photoUrl.body.data.url).toContain("http");
    const signatureUrl = await request(app).get(`/api/v1/visits/${visitId}/signature`).set(auth(context.ownerToken));
    expect(signatureUrl.status).toBe(200);

    // Done is final.
    expect((await post(`/visits/${visitId}/complete`, tara)).status).toBe(409);
    const late = await request(app).patch(`/api/v1/visits/${visitId}/report`).set(auth(tara)).send({ diagnosis: "x" });
    expect(late.status).toBe(409);
    expect((await post(`/visits/${visitId}/signature`, tara).send(signature)).status).toBe(409);

    const events = await prisma.auditEvent.findMany({ where: { action: { startsWith: "visits." } } });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["visits.complete", "visits.signature", "visits.photos", "visits.report"]),
    );
  });

  it("rejects report, photo and signature before arrival, and signature before start", async () => {
    const context = await setup();
    const { visitId } = await scheduledJob(context, "tara", "2026-11-03T10:00:00.000Z");
    const tara = await login("tara@example.com");
    const report = await request(app).patch(`/api/v1/visits/${visitId}/report`).set(auth(tara)).send({ diagnosis: "x" });
    expect(report.status).toBe(409);
    expect(report.body.error.code).toBe("INVALID_TRANSITION");
    const photo = await post(`/visits/${visitId}/photos`, tara).set("Content-Type", "image/png").set("X-File-Name", "a.png").send(png);
    expect(photo.status).toBe(409);
    await post(`/visits/${visitId}/en-route`, tara);
    await post(`/visits/${visitId}/arrive`, tara);
    expect((await post(`/visits/${visitId}/signature`, tara).send(signature)).status).toBe(409);
    expect((await post(`/visits/${visitId}/complete`, tara)).status).toBe(409);
  });

  it("validates the input", async () => {
    const { tara, visitId } = await startedJob();
    expect((await request(app).patch(`/api/v1/visits/${visitId}/report`).set(auth(tara)).send({})).status).toBe(400);
    const bad = await post(`/visits/${visitId}/photos`, tara).set("Content-Type", "application/pdf").set("X-File-Name", "a.pdf").send(Buffer.from("%PDF"));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const fake = await post(`/visits/${visitId}/signature`, tara).send({ signerName: "A", image: "data:image/png;base64,AAAA" });
    expect(fake.status).toBe(400);
    expect((await post(`/visits/${visitId}/signature`, tara).send({ image: signature.image })).status).toBe(400);
  });

  it("allows only the visit's technician to record work, and keeps other orgs and customers out", async () => {
    const { context, visitId, workOrderId } = await startedJob();
    const sam = await login("sam@example.com");
    const report = await request(app).patch(`/api/v1/visits/${visitId}/report`).set(auth(sam)).send({ diagnosis: "x" });
    expect(report.status).toBe(403);
    expect((await post(`/visits/${visitId}/signature`, sam).send(signature)).status).toBe(403);
    for (const token of [context.opsToken, context.adminToken, context.ownerToken]) {
      expect((await post(`/visits/${visitId}/complete`, token)).status).toBe(403);
      expect((await request(app).patch(`/api/v1/visits/${visitId}/report`).set(auth(token)).send({ diagnosis: "x" })).status).toBe(403);
    }
    expect((await post(`/work-orders/${workOrderId}/notes`, sam).send({ body: "hi" })).status).toBe(403);
    expect((await post(`/work-orders/${workOrderId}/notes`, context.ownerToken).send({ body: "hi" })).status).toBe(403);
    expect((await post(`/work-orders/${workOrderId}/notes`, context.opsToken).send({ body: "Ops note" })).status).toBe(201);
    expect((await request(app).get(`/api/v1/visits/${visitId}/signature`).set(auth(sam))).status).toBe(403);
    expect((await request(app).get(`/api/v1/visits/missing/signature`).set(auth(context.opsToken))).status).toBe(404);
  });
});
