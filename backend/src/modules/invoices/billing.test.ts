import request from "supertest";
import { extractText } from "unpdf";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { auth, hashedPassword, login, password, scheduledJob, seedStaff, setup } from "../../test/jobFixtures.js";
import { billableHours, chooseCoverage, noCoverage, priceInvoice } from "./invoice.pricing.js";
import { canInvoice } from "./invoice.transitions.js";

const signature = {
  signerName: "Owner",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

beforeEach(async () => {
  await resetDatabase();
  await seedStaff();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const api = (path: string) => `/api/v1${path}`;

describe("invoice arithmetic", () => {
  const base = {
    serviceTypeName: "Repair",
    serviceCharge: "500",
    labourRatePerHour: "1000",
    labourMinutes: 20,
    parts: [{ visitPartId: "vp", sku: "CAP", name: "Capacitor", quantity: 1, unitPrice: "850" }],
    additional: [],
    coverage: noCoverage,
    discount: "0",
    taxRatePercent: "18",
    supply: "INTRA_STATE" as const,
  };

  it("matches the requirements example: 500 + 850 + 500, 18% tax, 2183 total", () => {
    const priced = priceInvoice(base);
    expect(priced.lines.map((line) => [line.kind, line.amount.toFixed(2)])).toEqual([
      ["SERVICE_CHARGE", "500.00"],
      ["LABOUR", "500.00"],
      ["PART", "850.00"],
    ]);
    expect(priced.subtotal.toFixed(2)).toBe("1850.00");
    expect(priced.cgst.toFixed(2)).toBe("166.50");
    expect(priced.sgst.toFixed(2)).toBe("166.50");
    expect(priced.taxTotal.toFixed(2)).toBe("333.00");
    expect(priced.total.toFixed(2)).toBe("2183.00");
  });

  it("applies coverage per line, then discount, then tax", () => {
    const priced = priceInvoice({
      ...base,
      coverage: { source: "CONTRACT", serviceChargePercent: 100, labourPercent: 100, partsPercent: 50 },
      discount: "25",
    });
    expect(priced.coveredTotal.toFixed(2)).toBe("1425.00");
    expect(priced.taxableAmount.toFixed(2)).toBe("400.00");
    expect(priced.total.toFixed(2)).toBe("472.00");
    expect(() => priceInvoice({ ...base, discount: "1850.01" })).toThrow();
  });

  it("charges the same tax as IGST on an inter-state supply, keeping the total", () => {
    const intra = priceInvoice(base);
    const inter = priceInvoice({ ...base, supply: "INTER_STATE" });
    expect(intra.igst.toFixed(2)).toBe("0.00");
    expect([inter.cgst.toFixed(2), inter.sgst.toFixed(2), inter.igst.toFixed(2)]).toEqual(["0.00", "0.00", "333.00"]);
    expect(inter.taxTotal.toFixed(2)).toBe(intra.taxTotal.toFixed(2));
    expect(inter.total.toFixed(2)).toBe(intra.total.toFixed(2));
    // IGST is the two rounded halves, not 18% rounded once: 9% of 1.03 is 0.09, so 0.18 (not 0.19).
    const tiny = { ...base, serviceCharge: "1.03", labourRatePerHour: "0", parts: [] };
    expect(priceInvoice(tiny).cgst.toFixed(2)).toBe("0.09");
    expect(priceInvoice({ ...tiny, supply: "INTER_STATE" }).igst.toFixed(2)).toBe("0.18");
    expect(priceInvoice({ ...tiny, supply: "INTER_STATE" }).total.toFixed(2)).toBe(priceInvoice(tiny).total.toFixed(2));
  });

  it("bills labour in half hours rounded up, at least one", () => {
    expect(billableHours(0).toString()).toBe("0.5");
    expect(billableHours(30).toString()).toBe("0.5");
    expect(billableHours(31).toString()).toBe("1");
    expect(billableHours(95).toString()).toBe("2");
  });

  it("prefers warranty, then the active contract on the completion date", () => {
    const completedAt = new Date("2026-11-03T12:00:00Z");
    const contract = {
      id: "c1",
      startsOn: new Date("2026-01-01T00:00:00Z"),
      endsOn: new Date("2026-12-31T23:59:59Z"),
      status: "ACTIVE",
      serviceChargeCoveredPercent: 100,
      labourCoveredPercent: 100,
      partsCoveredPercent: 0,
    };
    expect(chooseCoverage({ completedAt, warrantyExpiresAt: new Date("2027-01-01"), contracts: [contract] }).source).toBe("WARRANTY");
    expect(chooseCoverage({ completedAt, warrantyExpiresAt: new Date("2026-01-01"), contracts: [contract] })).toMatchObject({ source: "CONTRACT", contractId: "c1" });
    expect(chooseCoverage({ completedAt, warrantyExpiresAt: null, contracts: [{ ...contract, status: "CANCELLED" }] }).source).toBe("NONE");
    expect(chooseCoverage({ completedAt, warrantyExpiresAt: null, contracts: [{ ...contract, endsOn: new Date("2026-11-01") }] }).source).toBe("NONE");
    expect(canInvoice("pay", "OVERDUE")).toBe(true);
    expect(canInvoice("issue", "ISSUED")).toBe(false);
  });
});

async function billingSetup() {
  const context = await setup();
  const ops = context.opsToken;
  const serviceTypes = await request(app).get(api("/service-types")).set(auth(ops));
  const repair = serviceTypes.body.data[0].id as string;
  const priced = await request(app)
    .patch(api(`/service-types/${repair}`))
    .set(auth(ops))
    .send({ serviceCharge: "500.00", labourRatePerHour: "1000.00", sacCode: "998719" });
  expect(priced.status).toBe(200);
  const part = await request(app).post(api("/parts")).set(auth(ops)).send({ sku: "cap-35", name: "Capacitor", unitPrice: "850.00" });
  const van = await request(app).post(api("/warehouses")).set(auth(ops)).send({ name: "Van", kind: "VAN", technicianId: context.technicians.tara });
  await request(app).post(api("/inventory/receipts")).set(auth(ops)).send({ warehouseId: van.body.data.id, partId: part.body.data.id, quantity: 10, reason: "Stock" });
  const tara = await login("tara@example.com");
  let hour = 8;

  async function completedJob() {
    hour += 3;
    const job = await scheduledJob(context, "tara", `2026-11-03T${String(hour).padStart(2, "0")}:00:00.000Z`);
    for (const step of ["en-route", "arrive", "start"]) {
      await request(app).post(api(`/visits/${job.visitId}/${step}`)).set(auth(tara));
    }
    const added = await request(app).post(api(`/visits/${job.visitId}/parts`)).set(auth(tara)).send({ partId: part.body.data.id, quantity: 1 });
    await request(app).post(api(`/visits/${job.visitId}/parts/${added.body.data.visits[0].parts[0].id as string}/consume`)).set(auth(tara));
    await request(app).patch(api(`/visits/${job.visitId}/report`)).set(auth(tara)).send({ workPerformed: "Replaced capacitor" });
    await request(app).post(api(`/visits/${job.visitId}/signature`)).set(auth(tara)).send(signature);
    const done = await request(app).post(api(`/visits/${job.visitId}/complete`)).set(auth(tara));
    expect(done.status).toBe(200);
    expect(done.body.data.invoice).toMatchObject({ status: "DRAFT" });
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.workOrderId } });
    return { ...job, invoiceId: done.body.data.invoice.id as string, assetId: workOrder.assetId, customerId: workOrder.customerId, addressId: workOrder.addressId };
  }

  // The job site's state, changed the way the office does it: through the address endpoint.
  async function moveSite(job: { customerId: string; addressId: string }, state: string) {
    const moved = await request(app).patch(api(`/customers/${job.customerId}/addresses/${job.addressId}`)).set(auth(ops)).send({ state });
    expect(moved.status).toBe(200);
  }

  return { context, ops, tara, completedJob, moveSite };
}

describe("billing", () => {
  it("produces a correct invoice for a completed job that reaches PAID", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const { invoiceId, workOrderId } = await completedJob();

    // Drafts stay with the office.
    expect((await request(app).get(api(`/invoices/${invoiceId}`)).set(auth(context.ownerToken))).status).toBe(404);
    const draft = await request(app).get(api(`/work-orders/${workOrderId}/invoice`)).set(auth(ops));
    expect(draft.body.data).toMatchObject({ status: "DRAFT", subtotal: "1850", taxTotal: "333", total: "2183", coverageSource: "NONE" });
    expect(draft.body.data.lines.map((line: { kind: string; amount: string; sacCode: string | null }) => [line.kind, line.amount, line.sacCode])).toEqual([
      ["SERVICE_CHARGE", "500", "998719"],
      ["LABOUR", "500", "998719"],
      ["PART", "850", null],
    ]);

    const extra = await request(app).post(api(`/invoices/${invoiceId}/lines`)).set(auth(ops)).send({ description: "Call-out after hours", amount: "150.00" });
    expect(extra.status).toBe(201);
    const discounted = await request(app).patch(api(`/invoices/${invoiceId}`)).set(auth(ops)).send({ discount: "100.00" });
    expect(discounted.body.data).toMatchObject({ subtotal: "2000", discount: "100", taxableAmount: "1900", taxTotal: "342", total: "2242" });
    expect((await request(app).patch(api(`/invoices/${invoiceId}`)).set(auth(ops)).send({ discount: "5000.00" })).status).toBe(400);

    const issued = await request(app).post(api(`/invoices/${invoiceId}/issue`)).set(auth(ops));
    expect(issued.status).toBe(200);
    expect(issued.body.data).toMatchObject({ status: "ISSUED", number: expect.stringMatching(/^INV-\d{4}-00001$/) });
    expect(new Date(issued.body.data.dueAt).getTime() - new Date(issued.body.data.issuedAt).getTime()).toBe(15 * 86_400_000);
    expect((await request(app).post(api(`/invoices/${invoiceId}/issue`)).set(auth(ops))).status).toBe(409);
    expect((await request(app).patch(api(`/invoices/${invoiceId}`)).set(auth(ops)).send({ discount: "0" })).status).toBe(409);

    const part = await request(app).post(api(`/invoices/${invoiceId}/payments`)).set(auth(ops)).send({ amount: "1000.00", method: "UPI", reference: "UPI-1" });
    expect(part.status).toBe(201);
    expect(part.body.data).toMatchObject({ status: "ISSUED", amountPaid: "1000" });
    const over = await request(app).post(api(`/invoices/${invoiceId}/payments`)).set(auth(ops)).send({ amount: "1242.01", method: "CASH" });
    expect(over.status).toBe(409);
    expect(over.body.error).toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE", details: { balance: "1242.00" } });
    const rest = await request(app).post(api(`/invoices/${invoiceId}/payments`)).set(auth(ops)).send({ amount: "1242.00", method: "CASH" });
    expect(rest.body.data).toMatchObject({ status: "PAID", amountPaid: "2242" });
    expect(rest.body.data.paidAt).toEqual(expect.any(String));
    expect((await request(app).post(api(`/invoices/${invoiceId}/payments`)).set(auth(ops)).send({ amount: "1.00", method: "CASH" })).status).toBe(409);
    expect((await request(app).post(api(`/invoices/${invoiceId}/void`)).set(auth(ops)).send({ reason: "x" })).status).toBe(409);

    // The customer sees the issued invoice and its payments.
    const mine = await request(app).get(api("/invoices")).set(auth(context.ownerToken));
    expect(mine.body.data.map((row: { id: string }) => row.id)).toEqual([invoiceId]);
    const view = await request(app).get(api(`/invoices/${invoiceId}`)).set(auth(context.ownerToken));
    expect(view.body.data.payments).toHaveLength(2);

    const audit = await prisma.auditEvent.findMany({ where: { action: { in: ["invoices.issue", "invoices.payments"] } } });
    expect(audit).toHaveLength(3);
  });

  it("charges only the uncovered amount on a contract-covered job, and nothing under warranty", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const first = await completedJob();
    // The contract is added for the asset; the draft reprices from the source data on change.
    const contract = await request(app).post(api("/contracts")).set(auth(ops)).send({
      customerId: first.customerId,
      name: "AMC 2026",
      startsOn: "2026-01-01",
      endsOn: "2030-12-31",
      assetIds: [first.assetId],
      serviceChargeCoveredPercent: 100,
      labourCoveredPercent: 100,
      partsCoveredPercent: 50,
    });
    expect(contract.status).toBe(201);
    const covered = await completedJob();
    const invoice = await request(app).get(api(`/invoices/${covered.invoiceId}`)).set(auth(ops));
    // Each job uses its own asset; cover the second one and reprice the draft.
    await prisma.contractAsset.create({ data: { contractId: contract.body.data.id, assetId: covered.assetId } });
    const repriced = await request(app).patch(api(`/invoices/${covered.invoiceId}`)).set(auth(ops)).send({ notes: "Covered by AMC" });
    expect(invoice.body.data.coverageSource).toBe("NONE");
    expect(repriced.body.data).toMatchObject({
      coverageSource: "CONTRACT",
      contract: { name: "AMC 2026" },
      subtotal: "1850",
      coveredTotal: "1425",
      taxableAmount: "425",
      taxTotal: "76.5",
      total: "501.5",
    });
    const paid = await request(app).post(api(`/invoices/${covered.invoiceId}/issue`)).set(auth(ops));
    expect(paid.body.data.status).toBe("ISSUED");
    const online = await request(app).post(api(`/invoices/${covered.invoiceId}/pay`)).set(auth(context.ownerToken));
    expect(online.status).toBe(201);
    expect(online.body.data).toMatchObject({ status: "PAID", amountPaid: "501.5" });
    expect(online.body.data.payments[0]).toMatchObject({ method: "ONLINE", provider: "mock", amount: "501.5" });

    // Warranty: the asset is under warranty at completion, so the job costs nothing.
    const warranty = await completedJob();
    await prisma.asset.update({ where: { id: warranty.assetId }, data: { warrantyExpiresAt: new Date("2030-01-01") } });
    const free = await request(app).patch(api(`/invoices/${warranty.invoiceId}`)).set(auth(ops)).send({ notes: "Warranty" });
    expect(free.body.data).toMatchObject({ coverageSource: "WARRANTY", coveredTotal: "1850", total: "0" });
    const settled = await request(app).post(api(`/invoices/${warranty.invoiceId}/issue`)).set(auth(ops));
    expect(settled.body.data.status).toBe("PAID");
  });

  it("detects overdue invoices, still accepts payment, and voids unpaid ones", async () => {
    const { context, ops, tara, completedJob } = await billingSetup();
    const job = await completedJob();
    await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    await prisma.invoice.update({ where: { id: job.invoiceId }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const overdue = await request(app).get(api("/invoices?status=OVERDUE")).set(auth(ops));
    expect(overdue.body.data.map((row: { id: string }) => row.id)).toEqual([job.invoiceId]);
    const paid = await request(app).post(api(`/invoices/${job.invoiceId}/payments`)).set(auth(ops)).send({ amount: "2183.00", method: "BANK_TRANSFER" });
    expect(paid.body.data.status).toBe("PAID");

    const other = await completedJob();
    expect((await request(app).post(api(`/invoices/${other.invoiceId}/payments`)).set(auth(ops)).send({ amount: "1.00", method: "CASH" })).status).toBe(409);
    expect((await request(app).post(api(`/invoices/${other.invoiceId}/void`)).set(auth(ops)).send({})).status).toBe(400);
    const voided = await request(app).post(api(`/invoices/${other.invoiceId}/void`)).set(auth(ops)).send({ reason: "Duplicate job" });
    expect(voided.body.data).toMatchObject({ status: "VOID", notes: "Voided: Duplicate job" });
    expect((await request(app).post(api(`/invoices/${other.invoiceId}/issue`)).set(auth(ops))).status).toBe(409);

    // Roles and orgs.
    expect((await request(app).get(api("/invoices")).set(auth(tara))).status).toBe(403);
    expect((await request(app).post(api(`/invoices/${job.invoiceId}/payments`)).set(auth(context.ownerToken)).send({ amount: "1.00", method: "CASH" })).status).toBe(403);
    expect((await request(app).post(api(`/invoices/${job.invoiceId}/pay`)).set(auth(ops))).status).toBe(403);
    expect((await request(app).post(api("/invoices/mark-overdue")).set(auth(ops))).body.data).toEqual({ marked: 0 });
    const passwordHash = await hashedPassword();
    const outsiderOrg = await prisma.organization.create({ data: { name: "Other" } });
    await prisma.user.create({ data: { organizationId: outsiderOrg.id, email: "x@other.example", name: "X", role: "OPS", passwordHash } });
    const outsider = await login("x@other.example");
    expect((await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(outsider))).status).toBe(404);
    expect((await request(app).get(api(`/work-orders/${job.workOrderId}/report`)).set(auth(outsider))).status).toBe(404);
  });

  it("serves the service report PDF to the customer once the job is complete", async () => {
    const { context, tara, completedJob } = await billingSetup();
    const job = await completedJob();
    const pdf = await request(app)
      .get(api(`/work-orders/${job.workOrderId}/report`))
      .set(auth(context.ownerToken))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await request(app).get(api(`/work-orders/${job.workOrderId}/report`)).set(auth(tara))).status).toBe(200);
    const sam = await login("sam@example.com");
    expect((await request(app).get(api(`/work-orders/${job.workOrderId}/report`)).set(auth(sam))).status).toBe(403);
    const open = await scheduledJob(context, "tara", "2026-11-04T10:00:00.000Z");
    const early = await request(app).get(api(`/work-orders/${open.workOrderId}/report`)).set(auth(context.opsToken));
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("REPORT_NOT_READY");
  });
});

const taxOf = (invoice: Record<string, unknown>) => ({ cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst, taxTotal: invoice.taxTotal, total: invoice.total });

describe("GST supply type", () => {
  it("charges CGST and SGST when the site is in the organisation's state", async () => {
    const { ops, completedJob } = await billingSetup();
    const job = await completedJob();
    const issued = await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    expect(taxOf(issued.body.data)).toEqual({ cgst: "166.5", sgst: "166.5", igst: "0", taxTotal: "333", total: "2183" });
  });

  it("charges IGST when the site is in another state, with the same total", async () => {
    const { ops, completedJob, moveSite } = await billingSetup();
    const first = await completedJob();
    await moveSite(first, "Maharashtra");
    const job = await completedJob();
    const draft = await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(ops));
    expect(taxOf(draft.body.data)).toEqual({ cgst: "0", sgst: "0", igst: "333", taxTotal: "333", total: "2183" });
    const issued = await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    expect(issued.body.data).toMatchObject({ status: "ISSUED", taxRatePercent: "18", cgst: "0", sgst: "0", igst: "333", total: "2183" });
  });

  it("flips a draft when the site state changes before issue, and freezes it once issued", async () => {
    const { ops, completedJob, moveSite } = await billingSetup();
    const job = await completedJob();
    expect(taxOf((await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(ops))).body.data)).toMatchObject({ cgst: "166.5", igst: "0" });

    // The site's state is corrected to Maharashtra ("MH") after the draft was written. Reads do not
    // reprice; issuing prices the draft one last time, so the issued invoice is inter-state.
    await moveSite(job, "MH");
    expect(taxOf((await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(ops))).body.data)).toMatchObject({ cgst: "166.5", igst: "0" });
    const issued = await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    expect(issued.status).toBe(200);
    expect(taxOf(issued.body.data)).toEqual({ cgst: "0", sgst: "0", igst: "333", taxTotal: "333", total: "2183" });

    // Editing a draft reprices it immediately too: a second job flips back when the site returns.
    const second = await completedJob();
    expect(taxOf((await request(app).get(api(`/invoices/${second.invoiceId}`)).set(auth(ops))).body.data)).toMatchObject({ igst: "333" });
    await moveSite(second, "karnataka");
    const edited = await request(app).patch(api(`/invoices/${second.invoiceId}`)).set(auth(ops)).send({ discount: "100.00" });
    expect(taxOf(edited.body.data)).toEqual({ cgst: "157.5", sgst: "157.5", igst: "0", taxTotal: "315", total: "2065" });

    // The issued invoice keeps its inter-state tax although the site is back in Karnataka.
    const after = await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(ops));
    expect(taxOf(after.body.data)).toEqual({ cgst: "0", sgst: "0", igst: "333", taxTotal: "333", total: "2183" });
  });

  it("never reprices issued, paid, overdue or void invoices", async () => {
    const { ops, completedJob, moveSite } = await billingSetup();
    const jobs = { issued: await completedJob(), paid: await completedJob(), overdue: await completedJob(), void: await completedJob() };
    for (const job of Object.values(jobs)) {
      expect((await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops))).status).toBe(200);
    }
    await request(app).post(api(`/invoices/${jobs.paid.invoiceId}/payments`)).set(auth(ops)).send({ amount: "2183.00", method: "UPI" });
    await prisma.invoice.update({ where: { id: jobs.overdue.invoiceId }, data: { dueAt: new Date(Date.now() - 60_000) } });
    await request(app).post(api(`/invoices/${jobs.void.invoiceId}/void`)).set(auth(ops)).send({ reason: "Duplicate" });
    type InvoiceBody = Record<string, unknown> & { status: string; lines: unknown[] };
    const read = async (invoiceId: string): Promise<InvoiceBody> => (await request(app).get(api(`/invoices/${invoiceId}`)).set(auth(ops))).body.data;
    const before: Record<string, InvoiceBody> = Object.fromEntries(await Promise.all(Object.entries(jobs).map(async ([name, job]) => [name, await read(job.invoiceId)])));
    expect(Object.values(before).map((invoice) => invoice.status)).toEqual(["ISSUED", "PAID", "OVERDUE", "VOID"]);

    await moveSite(jobs.issued, "Telangana");
    for (const [name, job] of Object.entries(jobs)) {
      expect((await request(app).patch(api(`/invoices/${job.invoiceId}`)).set(auth(ops)).send({ notes: "x" })).status).toBe(409);
      expect((await request(app).post(api(`/invoices/${job.invoiceId}/lines`)).set(auth(ops)).send({ description: "x", amount: "1.00" })).status).toBe(409);
      expect((await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops))).status).toBe(409);
      const now = await read(job.invoiceId);
      expect({ ...taxOf(now), status: now.status, lines: now.lines.length }).toEqual({ ...taxOf(before[name]!), status: before[name]!.status, lines: before[name]!.lines.length });
      expect(taxOf(now)).toMatchObject({ cgst: "166.5", sgst: "166.5", igst: "0" });
    }
  });

  it("refuses to price without the organisation's GST state or a recognised site state", async () => {
    const { ops, tara, completedJob, moveSite, context } = await billingSetup();
    const draft = await completedJob();
    const organization = await prisma.organization.findFirstOrThrow({ where: { name: "Plan Co" } });

    // Without a GST state nothing can be priced: completion (which writes the draft), edits, issue.
    await prisma.organization.update({ where: { id: organization.id }, data: { gstState: null } });
    const job = await scheduledJob(context, "tara", "2026-11-05T09:00:00.000Z");
    for (const step of ["en-route", "arrive", "start"]) {
      await request(app).post(api(`/visits/${job.visitId}/${step}`)).set(auth(tara));
    }
    await request(app).patch(api(`/visits/${job.visitId}/report`)).set(auth(tara)).send({ workPerformed: "Serviced" });
    await request(app).post(api(`/visits/${job.visitId}/signature`)).set(auth(tara)).send(signature);
    const blocked = await request(app).post(api(`/visits/${job.visitId}/complete`)).set(auth(tara));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ORG_GST_STATE_REQUIRED");
    expect((await prisma.serviceVisit.findUniqueOrThrow({ where: { id: job.visitId } })).status).toBe("IN_PROGRESS");
    expect(await prisma.invoice.count({ where: { workOrderId: job.workOrderId } })).toBe(0);
    const edit = await request(app).patch(api(`/invoices/${draft.invoiceId}`)).set(auth(ops)).send({ notes: "x" });
    expect(edit.body.error.code).toBe("ORG_GST_STATE_REQUIRED");
    const issue = await request(app).post(api(`/invoices/${draft.invoiceId}/issue`)).set(auth(ops));
    expect([issue.status, issue.body.error.code]).toEqual([409, "ORG_GST_STATE_REQUIRED"]);

    // A site state that is not an Indian state or UT is not guessed at.
    await prisma.organization.update({ where: { id: organization.id }, data: { gstState: "29" } });
    await moveSite(draft, "Texas");
    const unknown = await request(app).post(api(`/invoices/${draft.invoiceId}/issue`)).set(auth(ops));
    expect(unknown.status).toBe(422);
    expect(unknown.body.error).toMatchObject({ code: "SITE_STATE_UNRECOGNISED", details: { addressId: draft.addressId, state: "Texas" } });
    const stillBlocked = await request(app).post(api(`/visits/${job.visitId}/complete`)).set(auth(tara));
    expect(stillBlocked.body.error.code).toBe("SITE_STATE_UNRECOGNISED");
    expect((await request(app).get(api(`/invoices/${draft.invoiceId}`)).set(auth(ops))).body.data.status).toBe("DRAFT");

    // Once corrected, the job completes and the draft issues.
    await moveSite(draft, "Karnataka");
    expect((await request(app).post(api(`/visits/${job.visitId}/complete`)).set(auth(tara))).status).toBe(200);
    expect((await request(app).post(api(`/invoices/${draft.invoiceId}/issue`)).set(auth(ops))).status).toBe(200);
  });
});

// Fetches the invoice PDF as raw bytes (supertest does not buffer binary bodies by default).
function invoicePdf(invoiceId: string, token: string) {
  return request(app)
    .get(api(`/invoices/${invoiceId}/pdf`))
    .set(auth(token))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
}

// The PDF's text, whitespace collapsed, so assertions read like the printed page.
async function pdfText(body: Buffer) {
  const { text } = await extractText(new Uint8Array(body), { mergePages: true });
  return text.replace(/\s+/g, " ");
}

describe("invoice PDF", () => {
  it("lets admin, ops and the owning customer download issued, partly paid, paid, overdue and void invoices", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const issued = await completedJob();
    await request(app).post(api(`/invoices/${issued.invoiceId}/issue`)).set(auth(ops));
    await request(app).post(api(`/invoices/${issued.invoiceId}/payments`)).set(auth(ops)).send({ amount: "500.00", method: "CASH" });
    for (const token of [context.adminToken, ops, context.ownerToken]) {
      const pdf = await invoicePdf(issued.invoiceId, token);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      expect(pdf.headers["content-disposition"]).toBe('inline; filename="invoice-INV-2026-00001.pdf"');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    }

    const paid = await completedJob();
    await request(app).post(api(`/invoices/${paid.invoiceId}/issue`)).set(auth(ops));
    await request(app).post(api(`/invoices/${paid.invoiceId}/payments`)).set(auth(ops)).send({ amount: "2183.00", method: "UPI" });
    const overdue = await completedJob();
    await request(app).post(api(`/invoices/${overdue.invoiceId}/issue`)).set(auth(ops));
    await prisma.invoice.update({ where: { id: overdue.invoiceId }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const voided = await completedJob();
    await request(app).post(api(`/invoices/${voided.invoiceId}/issue`)).set(auth(ops));
    await request(app).post(api(`/invoices/${voided.invoiceId}/void`)).set(auth(ops)).send({ reason: "Raised twice" });

    const expected: [string, string][] = [
      [paid.invoiceId, "Status Paid"],
      [overdue.invoiceId, "Status Overdue"],
      [voided.invoiceId, "Status Void"],
    ];
    for (const [invoiceId, status] of expected) {
      const pdf = await invoicePdf(invoiceId, context.ownerToken);
      expect(pdf.status).toBe(200);
      expect(await pdfText(pdf.body as Buffer)).toContain(status);
    }
    const voidText = await pdfText((await invoicePdf(voided.invoiceId, ops)).body as Buffer);
    expect(voidText).toContain("Tax invoice (void)");
    expect(voidText).toContain("VOID");
    expect(voidText).toContain("This invoice is void and is not payable.");
    expect(voidText).toMatch(/Balance INR 0\.00/);
  });

  it("refuses technicians with 403, another organisation with 404, and another customer as reading the invoice does", async () => {
    const { context, ops, tara, completedJob } = await billingSetup();
    const job = await completedJob();
    await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));

    const technician = await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(tara));
    expect(technician.status).toBe(403);
    expect(technician.body.error.code).toBe("FORBIDDEN");

    const passwordHash = await hashedPassword();
    const outsiderOrg = await prisma.organization.create({ data: { name: "Other", gstState: "29" } });
    await prisma.user.create({ data: { organizationId: outsiderOrg.id, email: "x@other.example", name: "X", role: "ADMIN", passwordHash } });
    const outsider = await login("x@other.example");
    const foreign = await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(outsider));
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("INVOICE_NOT_FOUND");
    expect((await request(app).get(api("/invoices/missing/pdf")).set(auth(ops))).status).toBe(404);

    // A contact of another customer in the same organisation gets what GET /invoices/:id gives them.
    const neighbour = await request(app).post(api("/customers")).set(auth(context.adminToken)).send({ name: "Neighbour Co" });
    await request(app)
      .post(api(`/customers/${neighbour.body.data.id as string}/contacts`))
      .set(auth(context.adminToken))
      .send({ name: "Neighbour", email: "neighbour@example.com", password });
    const stranger = await login("neighbour@example.com");
    const view = await request(app).get(api(`/invoices/${job.invoiceId}`)).set(auth(stranger));
    const pdf = await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(stranger));
    expect(view.status).toBe(403);
    expect(pdf.status).toBe(view.status);
    expect(pdf.body.error.code).toBe(view.body.error.code);
  });

  it("answers 409 INVOICE_NOT_ISSUED for a draft, which stays hidden (404) from the customer", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const job = await completedJob();
    const draft = await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(ops));
    expect(draft.status).toBe(409);
    expect(draft.body.error).toMatchObject({ code: "INVOICE_NOT_ISSUED" });
    expect((await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(context.adminToken))).status).toBe(409);
    expect((await request(app).get(api(`/invoices/${job.invoiceId}/pdf`)).set(auth(context.ownerToken))).status).toBe(404);
    // Downloading writes nothing to the audit log: it is a read.
    expect(await prisma.auditEvent.count({ where: { action: { contains: "pdf" } } })).toBe(0);
  });

  it("prints the number, status, customer, site, SAC lines, coverage, discount, taxes, payments and balance", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const job = await completedJob();
    await request(app).patch(api(`/invoices/${job.invoiceId}`)).set(auth(ops)).send({ discount: "100.00" });
    const issued = await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    expect(issued.body.data).toMatchObject({ cgst: "157.5", sgst: "157.5", igst: "0", total: "2065" });
    await request(app).post(api(`/invoices/${job.invoiceId}/payments`)).set(auth(ops)).send({ amount: "1000.00", method: "UPI", reference: "UPI-7781" });

    const text = await pdfText((await invoicePdf(job.invoiceId, context.ownerToken)).body as Buffer);
    for (const fragment of [
      "Tax invoice",
      "Plan Co",
      "GST state: 29 Karnataka",
      "INV-2026-00001",
      "Issued · Partially paid",
      "Owner Co",
      "Site: 10 Main, Bengaluru, Karnataka 78702",
      "Supply: Intra-state (CGST + SGST)",
      "Coverage: Not covered",
      "Service charge · Repair 998719 1 500.00 500.00",
      "Labour (0.5 h) 998719 0.5 1,000.00 500.00",
      "Capacitor (CAP-35) — 1 850.00 850.00",
      "Subtotal INR 1,850.00",
      "Discount -INR 100.00",
      "Taxable amount INR 1,750.00",
      "CGST 9% INR 157.50",
      "SGST 9% INR 157.50",
      "Total INR 2,065.00",
      "UPI · UPI-7781",
      "INR 1,000.00",
      "Paid INR 1,000.00",
      "Balance INR 1,065.00",
    ]) {
      expect(text).toContain(fragment);
    }
    // Zero tax components are left out, as on the invoice page.
    expect(text).not.toContain("IGST");
  });

  it("prints the stored figures, never repricing, after the site moves state and prices change", async () => {
    const { ops, completedJob, moveSite } = await billingSetup();
    const job = await completedJob();
    await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: job.invoiceId }, include: { lines: true } });

    await moveSite(job, "Maharashtra");
    const serviceTypes = await request(app).get(api("/service-types")).set(auth(ops));
    await request(app).patch(api(`/service-types/${serviceTypes.body.data[0].id as string}`)).set(auth(ops)).send({ serviceCharge: "900.00" });

    const pdf = await invoicePdf(job.invoiceId, ops);
    expect(pdf.status).toBe(200);
    const text = await pdfText(pdf.body as Buffer);
    expect(text).toContain("CGST 9% INR 166.50");
    expect(text).toContain("SGST 9% INR 166.50");
    expect(text).toContain("Total INR 2,183.00");
    expect(text).toContain("Supply: Intra-state (CGST + SGST)");
    expect(text).not.toContain("IGST");
    expect(text).not.toContain("900.00");
    // The download leaves the stored invoice untouched.
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: job.invoiceId }, include: { lines: true } });
    expect(after).toEqual(before);
  });
});

const year = new Date().getUTCFullYear();

describe("credit notes and refunds", () => {
  async function issued(ops: string, job: { invoiceId: string }) {
    const response = await request(app).post(api(`/invoices/${job.invoiceId}/issue`)).set(auth(ops));
    expect(response.body.data).toMatchObject({ status: "ISSUED", total: "2183" });
    return job.invoiceId;
  }
  const credit = (id: string, token: string, body: object) => request(app).post(api(`/invoices/${id}/credit-notes`)).set(auth(token)).send(body);
  const refund = (id: string, token: string, body: object) => request(app).post(api(`/invoices/${id}/refunds`)).set(auth(token)).send(body);
  const pay = (id: string, token: string, amount: string) => request(app).post(api(`/invoices/${id}/payments`)).set(auth(token)).send({ amount, method: "UPI" });

  it("credits an issued invoice without touching its lines, numbers the notes, and marks it PAID when nothing is owed", async () => {
    const { context, ops, completedJob } = await billingSetup();
    const id = await issued(ops, await completedJob());
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } });

    const first = await credit(id, ops, { amount: "183.00", reason: "Goodwill for the late visit" });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ status: "ISSUED", total: "2183", creditedTotal: "183" });
    expect(first.body.data.creditNotes).toEqual([
      expect.objectContaining({ number: `CN-${year}-00001`, amount: "183", currency: "INR", reason: "Goodwill for the late visit", createdBy: expect.objectContaining({ name: expect.any(String) }) }),
    ]);
    expect(first.body.data.settlement).toEqual({ netTotal: "2000.00", netPaid: "0.00", balance: "2000.00", refundDue: "0.00", creditable: "2000.00", refundable: "0.00" });

    // Payments are capped by the balance after credits.
    expect((await pay(id, ops, "1000.00")).body.data.settlement.balance).toBe("1000.00");
    const over = await pay(id, ops, "1000.01");
    expect(over.status).toBe(409);
    expect(over.body.error).toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE", details: { balance: "1000.00" } });

    const second = await credit(id, context.adminToken, { amount: "1000.00", reason: "Part returned unused" });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ status: "PAID", creditedTotal: "1183", amountPaid: "1000" });
    expect(second.body.data.paidAt).toEqual(expect.any(String));
    expect(second.body.data.creditNotes.map((note: { number: string }) => note.number)).toEqual([`CN-${year}-00001`, `CN-${year}-00002`]);
    expect(second.body.data.settlement).toMatchObject({ balance: "0.00", refundDue: "0.00", creditable: "1000.00", refundable: "1000.00" });

    // The issued figures and lines are as they were.
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(after.lines).toEqual(before.lines);
    expect([after.subtotal, after.taxTotal, after.total].map(String)).toEqual([before.subtotal, before.taxTotal, before.total].map(String));

    const audit = await prisma.auditEvent.findMany({ where: { action: "invoices.credit-notes" } });
    expect(audit.map((event) => [event.entityType, event.entityId, event.status])).toEqual([
      ["invoices", id, 201],
      ["invoices", id, 201],
    ]);

    const pdf = await request(app)
      .get(api(`/invoices/${id}/pdf`))
      .set(auth(context.ownerToken))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    const text = await pdfText(pdf.body as Buffer);
    for (const fragment of ["Total INR 2,183.00", "Credit notes -INR 1,183.00", "Paid INR 1,000.00", "Balance INR 0.00", `CN-${year}-00001`, "Goodwill for the late visit", "-INR 183.00"]) {
      expect(text).toContain(fragment);
    }
    expect(text).not.toContain("Refund due");
  });

  it("leaves a refund due after crediting a paid invoice, and refunds it without deleting the payment", async () => {
    const { ops, completedJob } = await billingSetup();
    const id = await issued(ops, await completedJob());
    expect((await pay(id, ops, "2183.00")).body.data.status).toBe("PAID");

    const credited = await credit(id, ops, { amount: "500.00", reason: "Labour charged twice" });
    expect(credited.body.data).toMatchObject({ status: "PAID" });
    expect(credited.body.data.settlement).toMatchObject({ balance: "0.00", refundDue: "500.00", creditable: "1683.00", refundable: "2183.00" });
    const dashboard = await request(app).get(api("/analytics/dashboard")).set(auth(ops));
    expect(dashboard.body.data.pendingInvoices).toMatchObject({ outstanding: "0.00", refundDue: "500.00", refundDueCount: 1 });

    const refunded = await refund(id, ops, { amount: "500.00", reason: "Labour charged twice" });
    expect(refunded.status).toBe(201);
    expect(refunded.body.data).toMatchObject({ status: "PAID", amountPaid: "2183", refundedTotal: "500" });
    expect(refunded.body.data.refunds).toEqual([expect.objectContaining({ number: `RF-${year}-00001`, amount: "500", reason: "Labour charged twice" })]);
    expect(refunded.body.data.payments).toEqual([expect.objectContaining({ amount: "2183", method: "UPI" })]);
    expect(refunded.body.data.settlement).toMatchObject({ balance: "0.00", refundDue: "0.00", refundable: "1683.00" });
    expect(await prisma.payment.count({ where: { invoiceId: id } })).toBe(1);

    // Refunding past what is owed back reopens the invoice: the customer owes again.
    const reopened = await refund(id, ops, { amount: "83.00", reason: "Refunded too much by mistake" });
    expect(reopened.body.data).toMatchObject({ status: "ISSUED", paidAt: null, refundedTotal: "583" });
    expect(reopened.body.data.refunds.map((row: { number: string }) => row.number)).toEqual([`RF-${year}-00001`, `RF-${year}-00002`]);
    expect(reopened.body.data.settlement).toMatchObject({ balance: "83.00", refundDue: "0.00" });
    expect((await request(app).get(api("/analytics/dashboard")).set(auth(ops))).body.data.pendingInvoices).toMatchObject({ count: 1, outstanding: "83.00", refundDue: "0.00" });
    expect((await pay(id, ops, "83.00")).body.data).toMatchObject({ status: "PAID", amountPaid: "2266" });

    const audit = await prisma.auditEvent.count({ where: { action: "invoices.refunds", entityId: id, status: 201 } });
    expect(audit).toBe(2);
  });

  it("sends a refunded invoice past its due date to OVERDUE, and the overdue job skips invoices settled by credits", async () => {
    const { ops, completedJob } = await billingSetup();
    const late = await issued(ops, await completedJob());
    await pay(late, ops, "2183.00");
    await prisma.invoice.update({ where: { id: late }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const reopened = await refund(late, ops, { amount: "100.00", reason: "Wrong part price" });
    expect(reopened.body.data).toMatchObject({ status: "OVERDUE" });
    expect(reopened.body.data.settlement.balance).toBe("100.00");

    // Fully credited with no payments: PAID, nothing to chase, even past the due date.
    const waived = await issued(ops, await completedJob());
    expect((await credit(waived, ops, { amount: "2183.00", reason: "Waived" })).body.data).toMatchObject({ status: "PAID" });
    // An ISSUED row whose credits cover the total (forced here) is not marked overdue either.
    const covered = await issued(ops, await completedJob());
    await prisma.invoice.update({ where: { id: covered }, data: { creditedTotal: "2183.00", dueAt: new Date(Date.now() - 60_000) } });
    await prisma.invoice.update({ where: { id: waived }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const partly = await issued(ops, await completedJob());
    await credit(partly, ops, { amount: "2000.00", reason: "Mostly waived" });
    await prisma.invoice.update({ where: { id: partly }, data: { dueAt: new Date(Date.now() - 60_000) } });

    expect((await request(app).post(api("/invoices/mark-overdue")).set(auth(ops))).body.data).toEqual({ marked: 1 });
    const statuses = await prisma.invoice.findMany({ where: { id: { in: [waived, covered, partly] } }, select: { id: true, status: true } });
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({ [waived]: "PAID", [covered]: "ISSUED", [partly]: "OVERDUE" });
  });

  it("rejects malformed amounts with 400, and credits or refunds over the limits with 409", async () => {
    const { ops, completedJob } = await billingSetup();
    const id = await issued(ops, await completedJob());
    for (const amount of ["0", "0.00", "-5.00", "10.123", "abc", "", 100, null]) {
      for (const send of [credit, refund]) {
        const response = await send(id, ops, { amount, reason: "Test" });
        expect(response.status, `amount ${JSON.stringify(amount)}`).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    }
    expect((await credit(id, ops, { amount: "10.00" })).status).toBe(400);
    expect((await refund(id, ops, { amount: "10.00", reason: "  " })).status).toBe(400);

    // Nothing paid yet: any refund is over the limit.
    const unpaid = await refund(id, ops, { amount: "0.01", reason: "Nothing to refund" });
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error).toMatchObject({ code: "REFUND_EXCEEDS_PAID", details: { refundable: "0.00" } });

    const tooMuch = await credit(id, ops, { amount: "2183.01", reason: "More than the total" });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatchObject({ code: "CREDIT_EXCEEDS_REMAINING", details: { creditable: "2183.00" } });
    expect((await credit(id, ops, { amount: "183.00", reason: "Goodwill" })).status).toBe(201);
    const afterEarlier = await credit(id, ops, { amount: "2000.01", reason: "More than what is left" });
    expect(afterEarlier.body.error).toMatchObject({ code: "CREDIT_EXCEEDS_REMAINING", details: { creditable: "2000.00" } });

    await pay(id, ops, "1000.00");
    expect((await refund(id, ops, { amount: "400.00", reason: "Part" })).status).toBe(201);
    const overRefund = await refund(id, ops, { amount: "600.01", reason: "More than was paid" });
    expect(overRefund.status).toBe(409);
    expect(overRefund.body.error).toMatchObject({ code: "REFUND_EXCEEDS_PAID", details: { refundable: "600.00" } });
    expect((await refund(id, ops, { amount: "600.00", reason: "The rest" })).body.data).toMatchObject({ refundedTotal: "1000", amountPaid: "1000" });

    // Exactly the remainder is allowed: nothing left to pay, nothing to refund.
    const all = await credit(id, ops, { amount: "2000.00", reason: "Job cancelled" });
    expect(all.body.data).toMatchObject({ status: "PAID", creditedTotal: "2183" });
    expect(all.body.data.settlement).toMatchObject({ netTotal: "0.00", balance: "0.00", refundDue: "0.00", creditable: "0.00", refundable: "0.00" });
    expect(await prisma.creditNote.count()).toBe(2);
    expect(await prisma.refund.count()).toBe(2);
  });

  it("refuses drafts and void invoices with 409 INVALID_TRANSITION, and keeps void for invoices without payments or credits", async () => {
    const { ops, completedJob } = await billingSetup();
    const draft = await completedJob();
    for (const send of [credit, refund]) {
      const response = await send(draft.invoiceId, ops, { amount: "10.00", reason: "Draft" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
    }
    const voided = await issued(ops, await completedJob());
    await request(app).post(api(`/invoices/${voided}/void`)).set(auth(ops)).send({ reason: "Raised twice" });
    for (const send of [credit, refund]) {
      const response = await send(voided, ops, { amount: "10.00", reason: "Void" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
    }
    const credited = await issued(ops, await completedJob());
    await credit(credited, ops, { amount: "100.00", reason: "Goodwill" });
    const noVoid = await request(app).post(api(`/invoices/${credited}/void`)).set(auth(ops)).send({ reason: "Changed my mind" });
    expect(noVoid.status).toBe(409);
    expect(noVoid.body.error).toMatchObject({ code: "INVALID_TRANSITION", message: "An invoice with credit notes cannot be voided" });
    const paidThenRefunded = await issued(ops, await completedJob());
    await pay(paidThenRefunded, ops, "100.00");
    await refund(paidThenRefunded, ops, { amount: "100.00", reason: "Returned" });
    expect((await request(app).post(api(`/invoices/${paidThenRefunded}/void`)).set(auth(ops)).send({ reason: "x" })).status).toBe(409);
    expect(await prisma.creditNote.count()).toBe(1);
  });

  it("lets only admin and ops credit or refund, shows them to the customer, and hides other organisations' invoices", async () => {
    const { context, ops, tara, completedJob } = await billingSetup();
    const id = await issued(ops, await completedJob());
    await pay(id, ops, "1000.00");
    for (const token of [context.ownerToken, tara]) {
      for (const send of [credit, refund]) {
        const response = await send(id, token, { amount: "10.00", reason: "Not allowed" });
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
      }
    }
    const passwordHash = await hashedPassword();
    const outsiderOrg = await prisma.organization.create({ data: { name: "Other", gstState: "29" } });
    await prisma.user.create({ data: { organizationId: outsiderOrg.id, email: "x@other.example", name: "X", role: "ADMIN", passwordHash } });
    const outsider = await login("x@other.example");
    for (const send of [credit, refund]) {
      const response = await send(id, outsider, { amount: "10.00", reason: "Other org" });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("INVOICE_NOT_FOUND");
    }
    expect(await prisma.creditNote.count()).toBe(0);
    expect(await prisma.refund.count()).toBe(0);

    expect((await credit(id, context.adminToken, { amount: "50.00", reason: "Admin credit" })).status).toBe(201);
    expect((await refund(id, ops, { amount: "25.00", reason: "Ops refund" })).status).toBe(201);
    const view = await request(app).get(api(`/invoices/${id}`)).set(auth(context.ownerToken));
    expect(view.body.data.creditNotes).toEqual([expect.objectContaining({ amount: "50", reason: "Admin credit" })]);
    expect(view.body.data.refunds).toEqual([expect.objectContaining({ amount: "25", reason: "Ops refund" })]);
    expect(view.body.data.settlement).toMatchObject({ balance: "1158.00" });
    const list = await request(app).get(api("/invoices")).set(auth(context.ownerToken));
    expect(list.body.data[0].settlement).toMatchObject({ balance: "1158.00" });
  });

  it("never lets concurrent credits or refunds pass the limits", async () => {
    const { ops, completedJob } = await billingSetup();
    const id = await issued(ops, await completedJob());
    await pay(id, ops, "2183.00");
    const credits = await Promise.all(Array.from({ length: 5 }, (_, index) => credit(id, ops, { amount: "1000.00", reason: `Race ${index}` })));
    expect(credits.map((response) => response.status).sort()).toEqual([201, 201, 409, 409, 409]);
    const refunds = await Promise.all(Array.from({ length: 5 }, (_, index) => refund(id, ops, { amount: "1000.00", reason: `Race ${index}` })));
    expect(refunds.map((response) => response.status).sort()).toEqual([201, 201, 409, 409, 409]);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { creditNotes: true, refunds: true } });
    expect([invoice.creditedTotal.toFixed(2), invoice.refundedTotal.toFixed(2)]).toEqual(["2000.00", "2000.00"]);
    expect(invoice.creditNotes.map((note) => note.number).sort()).toEqual([`CN-${year}-00001`, `CN-${year}-00002`]);
    expect(invoice.refunds.map((row) => row.number).sort()).toEqual([`RF-${year}-00001`, `RF-${year}-00002`]);
  });
});
