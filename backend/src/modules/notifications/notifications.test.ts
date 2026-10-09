import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { drainNotifications } from "../../lib/queue.js";
import { sentMail, setMailTransportFactory } from "../../lib/mailer.js";
import { sentSms } from "../../lib/sms.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, login, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";
import { notificationCatalog, render } from "./notification.catalog.js";
import { runSweeps } from "./notification.events.js";

const api = (path: string) => `/api/v1${path}`;
const signature = {
  signerName: "Owner",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
  sentMail.length = 0;
  sentSms.length = 0;
});

const smtpKeys = ["MAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;
const savedSmtp = Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  delete process.env.SMS_PROVIDER;
  for (const key of smtpKeys) {
    if (savedSmtp[key] === undefined) delete process.env[key];
    else process.env[key] = savedSmtp[key];
  }
  setMailTransportFactory(null);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function completeJob(context: Awaited<ReturnType<typeof setup>>, hour: number) {
  const job = await scheduledJob(context, "tara", `2026-11-03T${String(hour).padStart(2, "0")}:00:00.000Z`);
  const tara = await login("tara@example.com");
  for (const step of ["en-route", "arrive", "start"]) {
    expect((await request(app).post(api(`/visits/${job.visitId}/${step}`)).set(auth(tara))).status).toBe(200);
  }
  await request(app).patch(api(`/visits/${job.visitId}/report`)).set(auth(tara)).send({ workPerformed: "Fixed" });
  await request(app).post(api(`/visits/${job.visitId}/signature`)).set(auth(tara)).send(signature);
  expect((await request(app).post(api(`/visits/${job.visitId}/complete`)).set(auth(tara))).status).toBe(200);
  return { ...job, tara };
}

async function events(where: object = {}) {
  await drainNotifications();
  return prisma.notification.findMany({ where, orderBy: { createdAt: "asc" } });
}

describe("notification catalog", () => {
  it("covers all 22 events of requirements section 17, each unique", () => {
    expect(notificationCatalog).toHaveLength(22);
    expect(new Set(notificationCatalog.map((entry) => entry.event)).size).toBe(22);
    expect(render("Hi {{name}}, {{missing}}", { name: "Ann" })).toBe("Hi Ann, —");
  });
});

describe("notifications along the job", () => {
  it("notifies customer, technician and office at each step, in-app and by email", async () => {
    const context = await setup();
    await completeJob(context, 9);
    const rows = await events();
    const byAudience = (audience: string) => [...new Set(rows.filter((row) => row.audience === audience).map((row) => row.event))];
    expect(byAudience("CUSTOMER")).toEqual([
      "request.received",
      "request.accepted",
      "technician.assigned",
      "appointment.confirmed",
      "visit.en_route",
      "visit.arrived",
      "service.completed",
    ]);
    expect(byAudience("TECHNICIAN")).toEqual(["job.assigned"]);
    expect(byAudience("OPS")).toEqual(["request.new"]);
    expect(rows.every((row) => row.status === "SENT" && row.attempts === 1)).toBe(true);
    expect(sentMail.some((mail) => mail.to === "owner@example.com" && mail.subject === "Service completed")).toBe(true);
    // Nobody in the fixtures has a phone number, so no SMS deliveries are created.
    expect(rows.some((row) => row.channel === "SMS")).toBe(false);
  });

  it("sends SMS to people with a phone and retries failures until they are marked FAILED", async () => {
    const context = await setup();
    await prisma.technician.update({ where: { id: context.technicians.tara }, data: { phone: "+919800000001" } });
    process.env.SMS_PROVIDER = "fail";
    const job = await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z", false);
    const failed = await events({ channel: "SMS" });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ event: "job.assigned", status: "FAILED", attempts: 5, lastError: "SMS provider unavailable" });

    const deliveries = await request(app).get(api("/notifications/deliveries?status=FAILED")).set(auth(context.opsToken));
    expect(deliveries.body.data.map((row: { id: string }) => row.id)).toEqual([failed[0]!.id]);

    process.env.SMS_PROVIDER = "log";
    const retried = await request(app).post(api(`/notifications/deliveries/${failed[0]!.id}/retry`)).set(auth(context.opsToken));
    expect(retried.status).toBe(200);
    expect((await events({ id: failed[0]!.id }))[0]).toMatchObject({ status: "SENT", attempts: 1 });
    expect(sentSms).toEqual([{ to: "+919800000001", text: expect.stringContaining("New job assigned") }]);
    const again = await request(app).post(api(`/notifications/deliveries/${failed[0]!.id}/retry`)).set(auth(context.opsToken));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");
    expect(job.workOrderId).toBeTruthy();
  });

  it("retries a failed SMTP send through the worker until it is accepted or marked FAILED", async () => {
    // Fake transport only: no SMTP server is ever contacted.
    Object.assign(process.env, { MAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "mailer@example.com", SMTP_PASS: "not-a-real-password" });
    let failuresPerMessage = 2;
    const attempts = new Map<string, number>();
    setMailTransportFactory(() => ({
      sendMail: async (mail) => {
        const key = `${mail.subject}|${mail.to}|${mail.text}`;
        const seen = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, seen);
        if (seen <= failuresPerMessage) throw new Error("421 Service not available");
        return { messageId: "fake" };
      },
    }));
    const context = await setup();
    const tara = await login("tara@example.com");
    const decline = async (day: string, reason: string) => {
      const job = await scheduledJob(context, "tara", `2026-11-${day}T09:00:00.000Z`, false);
      expect((await request(app).post(api(`/work-orders/${job.workOrderId}/decline`)).set(auth(tara)).send({ reason })).status).toBe(200);
      return (await events({ channel: "EMAIL", event: "assignment.declined" })).filter((row) => row.body.endsWith(reason));
    };
    const declineAttempts = () => [...attempts].filter(([key]) => key.startsWith("Technician declined a job|")).map(([, count]) => count);

    const recovered = await decline("03", "Too far");
    expect(recovered.length).toBeGreaterThan(0);
    for (const row of recovered) {
      expect(row).toMatchObject({ status: "SENT", attempts: 3, lastError: null }); // cleared once accepted
    }
    expect(declineAttempts()).toEqual(recovered.map(() => 3));
    expect(sentMail.filter((mail) => mail.subject === "Technician declined a job")).toHaveLength(recovered.length);

    failuresPerMessage = Number.POSITIVE_INFINITY;
    attempts.clear();
    const failed = await decline("04", "Van broke down");
    expect(failed.length).toBe(recovered.length);
    for (const row of failed) {
      expect(row).toMatchObject({ status: "FAILED", attempts: 5, lastError: "421 Service not available", sentAt: null });
    }
    expect(declineAttempts()).toEqual(failed.map(() => 5));
    expect(sentMail.filter((mail) => mail.subject === "Technician declined a job")).toHaveLength(recovered.length);
  });

  it("tells the office about declines, the old technician about reassignment, and both sides about changes", async () => {
    const context = await setup();
    const declined = await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z", false);
    const tara = await login("tara@example.com");
    await request(app).post(api(`/work-orders/${declined.workOrderId}/decline`)).set(auth(tara)).send({ reason: "Too far" });
    const decline = await events({ event: "assignment.declined" });
    expect(decline.map((row) => row.body)).toContain("tara declined the job for Owner Co. Reason: Too far");

    const moved = await scheduledJob(context, "tara", "2026-11-04T09:00:00.000Z");
    await request(app)
      .post(api(`/work-orders/${moved.workOrderId}/reassign`))
      .set(auth(context.opsToken))
      .send({ technicianId: context.technicians.sam, reason: "Sick" });
    const changed = await events({ event: "assignment.changed" });
    const taraUser = await prisma.technician.findUniqueOrThrow({ where: { id: context.technicians.tara } });
    expect(changed.map((row) => row.recipientId)).toEqual([taraUser.userId]);

    await request(app)
      .post(api(`/visits/${moved.visitId}/reschedule`))
      .set(auth(context.opsToken))
      .send({ scheduledStart: "2026-11-05T10:00:00.000Z", reason: "Customer asked" });
    expect((await events({ event: "appointment.rescheduled", channel: "IN_APP" }))[0]!.body).toContain("2026-11-05 10:00 UTC");
    expect(await events({ event: "appointment.changed" })).not.toHaveLength(0);
    await request(app).post(api(`/visits/${moved.visitId}/cancel`)).set(auth(context.opsToken)).send({ reason: "Closed" });
    expect(await events({ event: "job.cancelled" })).not.toHaveLength(0);
  });

  it("raises follow-up, part and low-stock alerts", async () => {
    const context = await setup();
    const part = await request(app)
      .post(api("/parts"))
      .set(auth(context.opsToken))
      .send({ sku: "valve", name: "Valve", unitPrice: "100.00", reorderLevel: 2 });
    expect(part.body.data.reorderLevel).toBe(2);
    const van = await request(app).post(api("/warehouses")).set(auth(context.opsToken)).send({ name: "Van T", kind: "VAN", technicianId: context.technicians.tara });
    await request(app).post(api("/inventory/receipts")).set(auth(context.opsToken)).send({ warehouseId: van.body.data.id, partId: part.body.data.id, quantity: 4, reason: "Stock" });
    const job = await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z");
    const tara = await login("tara@example.com");
    await request(app).post(api(`/visits/${job.visitId}/en-route`)).set(auth(tara));
    await request(app).post(api(`/visits/${job.visitId}/arrive`)).set(auth(tara));
    await request(app).post(api(`/visits/${job.visitId}/parts`)).set(auth(tara)).send({ partId: part.body.data.id, quantity: 1 });
    expect(await events({ event: "inventory.low" })).toHaveLength(0);
    await request(app).post(api(`/visits/${job.visitId}/parts`)).set(auth(tara)).send({ partId: part.body.data.id, quantity: 1 });
    const low = await events({ event: "inventory.low", channel: "IN_APP" });
    expect(low.map((row) => row.body)).toEqual(["Valve (VALVE) at Van T is down to 2.", "Valve (VALVE) at Van T is down to 2."]);
    // Once per drop: a further reservation does not repeat the alert.
    await request(app).post(api(`/visits/${job.visitId}/parts`)).set(auth(tara)).send({ partId: part.body.data.id, quantity: 1 });
    expect(await events({ event: "inventory.low", channel: "IN_APP" })).toHaveLength(2);

    const ended = await request(app)
      .post(api(`/visits/${job.visitId}/unsuccessful`))
      .set(auth(tara))
      .send({ outcome: "AWAITING_PARTS", reason: "Wrong valve", partRequests: [{ partId: part.body.data.id, quantity: 2 }] });
    expect(ended.status).toBe(200);
    expect((await events({ event: "part.unavailable", channel: "IN_APP" }))[0]!.body).toBe("tara needs 2 × Valve for Owner Co.");
    expect(await events({ event: "job.another_visit" })).not.toHaveLength(0);
    const requests = await request(app).get(api(`/part-requests?workOrderId=${job.workOrderId}`)).set(auth(context.opsToken));
    await request(app).post(api(`/part-requests/${requests.body.data[0].id as string}/fulfil`)).set(auth(context.opsToken)).send({});
    expect((await events({ event: "follow_up.required" })).map((row) => row.audience)).toEqual(["TECHNICIAN"]);
  });

  it("sweeps for delayed jobs and expiring contracts once each", async () => {
    const context = await setup();
    await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z");
    const workOrder = await prisma.workOrder.findFirstOrThrow({});
    await request(app).post(api("/contracts")).set(auth(context.opsToken)).send({
      customerId: workOrder.customerId,
      name: "AMC 2026",
      startsOn: "2026-01-01",
      endsOn: "2026-11-20",
      assetIds: [workOrder.assetId],
    });
    const now = new Date("2026-11-03T10:00:00.000Z");
    expect(await runSweeps(now)).toBe(8);
    expect(await runSweeps(now)).toBe(0);
    const swept = await events({ event: { in: ["job.delayed", "contract.expiring"] }, channel: "IN_APP" });
    expect(swept.map((row) => row.body).sort()).toEqual([
      "AMC 2026 for Owner Co ends on 2026-11-20.",
      "AMC 2026 for Owner Co ends on 2026-11-20.",
      "The visit for Owner Co planned at 2026-11-03 09:00 UTC has not started.",
      "The visit for Owner Co planned at 2026-11-03 09:00 UTC has not started.",
    ]);
    const forbidden = await request(app).post(api("/notifications/sweep")).set(auth(await login("tara@example.com")));
    expect(forbidden.status).toBe(403);
  });
});

describe("inbox and rules", () => {
  it("lists only my in-app notifications and marks them read once", async () => {
    const context = await setup();
    await scheduledJob(context, "tara", "2026-11-03T09:00:00.000Z");
    await drainNotifications();
    const inbox = await request(app).get(api("/notifications")).set(auth(context.ownerToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.meta.unread).toBe(inbox.body.data.length);
    expect(inbox.body.data.every((row: { channel: string }) => row.channel === "IN_APP")).toBe(true);
    const first = inbox.body.data[0].id as string;
    expect((await request(app).post(api(`/notifications/${first}/read`)).set(auth(context.ownerToken))).status).toBe(200);
    const twice = await request(app).post(api(`/notifications/${first}/read`)).set(auth(context.ownerToken));
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("INVALID_TRANSITION");
    const notMine = await request(app).post(api(`/notifications/${first}/read`)).set(auth(context.opsToken));
    expect(notMine.status).toBe(404);
    const after = await request(app).get(api("/notifications")).set(auth(context.ownerToken));
    expect(after.body.meta.unread).toBe(inbox.body.meta.unread - 1);
  });

  it("lets an admin turn an event off or change its channels; others cannot", async () => {
    const context = await setup();
    const rules = await request(app).get(api("/notifications/rules")).set(auth(context.adminToken));
    expect(rules.body.data).toHaveLength(22);
    const received = rules.body.data.find((rule: { event: string }) => rule.event === "request.received");
    const off = await request(app).patch(api(`/notifications/rules/${received.id as string}`)).set(auth(context.adminToken)).send({ isEnabled: false });
    expect(off.body.data.isEnabled).toBe(false);
    const accepted = rules.body.data.find((rule: { event: string }) => rule.event === "request.accepted");
    await request(app).patch(api(`/notifications/rules/${accepted.id as string}`)).set(auth(context.adminToken)).send({ channels: ["IN_APP"] });
    await context.workOrder();
    expect(await events({ event: "request.received" })).toHaveLength(0);
    expect((await events({ event: "request.accepted" })).map((row) => row.channel)).toEqual(["IN_APP"]);

    expect((await request(app).get(api("/notifications/rules")).set(auth(context.opsToken))).status).toBe(403);
    expect((await request(app).patch(api(`/notifications/rules/${received.id as string}`)).set(auth(context.opsToken)).send({ isEnabled: true })).status).toBe(403);
    const invalid = await request(app).patch(api(`/notifications/rules/${received.id as string}`)).set(auth(context.adminToken)).send({ channels: ["FAX"] });
    expect(invalid.status).toBe(400);
    expect((await request(app).get(api("/notifications/deliveries")).set(auth(context.ownerToken))).status).toBe(403);
  });
});

describe("feedback", () => {
  it("lets the customer rate a completed job once and shows the office the average", async () => {
    const context = await setup();
    const early = await scheduledJob(context, "tara", "2026-11-03T08:00:00.000Z");
    const notYet = await request(app).post(api(`/work-orders/${early.workOrderId}/feedback`)).set(auth(context.ownerToken)).send({ rating: 5, satisfied: true });
    expect(notYet.status).toBe(409);
    expect(notYet.body.error.code).toBe("INVALID_TRANSITION");

    const first = await completeJob(context, 11);
    const second = await completeJob(context, 14);
    const rated = await request(app)
      .post(api(`/work-orders/${first.workOrderId}/feedback`))
      .set(auth(context.ownerToken))
      .send({ rating: 5, satisfied: true, comment: "Quick and tidy" });
    expect(rated.status).toBe(201);
    const duplicate = await request(app).post(api(`/work-orders/${first.workOrderId}/feedback`)).set(auth(context.ownerToken)).send({ rating: 1, satisfied: false });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("FEEDBACK_EXISTS");
    await request(app).post(api(`/work-orders/${second.workOrderId}/feedback`)).set(auth(context.ownerToken)).send({ rating: 2, satisfied: false, comment: "Late" });

    const listed = await request(app).get(api("/feedback")).set(auth(context.opsToken));
    expect(listed.body.meta).toEqual({ count: 2, averageRating: 3.5, satisfiedPercent: 50 });
    expect(listed.body.data[0].workOrder.technician.user.name).toBe("tara");
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: first.workOrderId } });
    const detail = await request(app).get(api(`/service-requests/${workOrder.requestId}`)).set(auth(context.ownerToken));
    expect(detail.body.data.workOrder.feedback).toMatchObject({ rating: 5, comment: "Quick and tidy" });
  });

  it("validates the rating and keeps feedback to the customer's own jobs", async () => {
    const context = await setup();
    const job = await completeJob(context, 9);
    const bad = await request(app).post(api(`/work-orders/${job.workOrderId}/feedback`)).set(auth(context.ownerToken)).send({ rating: 6, satisfied: true });
    expect(bad.status).toBe(400);
    expect((await request(app).post(api(`/work-orders/${job.workOrderId}/feedback`)).set(auth(context.opsToken)).send({ rating: 4, satisfied: true })).status).toBe(403);
    expect((await request(app).post(api(`/work-orders/${job.workOrderId}/feedback`)).set(auth(job.tara)).send({ rating: 4, satisfied: true })).status).toBe(403);
    expect((await request(app).get(api("/feedback")).set(auth(context.ownerToken))).status).toBe(403);

    const other = await prisma.organization.create({ data: { name: "Other" } });
    const otherCustomer = await prisma.customer.create({ data: { organizationId: other.id, name: "Stranger" } });
    await prisma.customerContact.create({ data: { customerId: otherCustomer.id, name: "S", email: "s@example.com" } });
    const admin = await request(app).post(api(`/customers`)).set(auth(context.adminToken)).send({ name: "Neighbour" });
    await request(app).post(api(`/customers/${admin.body.data.id as string}/contacts`)).set(auth(context.adminToken)).send({ name: "N", email: "n@example.com", password: "Password123!" });
    const neighbour = await login("n@example.com");
    const foreign = await request(app).post(api(`/work-orders/${job.workOrderId}/feedback`)).set(auth(neighbour)).send({ rating: 4, satisfied: true });
    expect(foreign.status).toBe(404);
  });
});
