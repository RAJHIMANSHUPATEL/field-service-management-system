import { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { charge } from "../../lib/payments.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { gstStateByCode, resolveGstState } from "../../lib/gstStates.js";
import { chooseCoverage, priceInvoice, PricingError, type DecimalValue, type Supply } from "./invoice.pricing.js";
import { creditStatuses, refundStatuses, settlement, settlementOf, statusAfter, type Ledger } from "./invoice.balance.js";
import type { AddLineInput, AdjustmentInput, ListInvoicesQuery, RecordPaymentInput, UpdateInvoiceInput } from "./invoice.schema.js";
import { canInvoice, editableStatuses, type InvoiceAction } from "./invoice.transitions.js";
import { invoiceEvent, notify } from "../notifications/notification.events.js";

type Tx = Prisma.TransactionClient;
const Decimal = Prisma.Decimal;

const invoiceInclude = {
  customer: { select: { id: true, name: true } },
  contract: { select: { id: true, name: true } },
  workOrder: {
    select: {
      id: true,
      status: true,
      request: { select: { id: true } },
      asset: { select: { id: true, equipmentType: true, serialNumber: true } },
      serviceType: { select: { id: true, name: true } },
    },
  },
  lines: { orderBy: { position: "asc" as const } },
  payments: {
    orderBy: { paidAt: "asc" as const },
    select: { id: true, amount: true, method: true, reference: true, provider: true, paidAt: true, recordedBy: { select: { id: true, name: true } } },
  },
  creditNotes: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { id: true, number: true, amount: true, currency: true, reason: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
  },
  refunds: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { id: true, number: true, amount: true, currency: true, reason: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
  },
};

// Every invoice the API returns carries its settlement (balance, refund due, creditable, refundable).
function withSettlement<T extends Ledger>(invoice: T) {
  return { ...invoice, settlement: settlement(invoice) };
}

// Everything the price depends on, read at the time of pricing.
async function pricingSource(tx: Tx, workOrderId: string) {
  const workOrder = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: {
      organization: true,
      address: true,
      serviceType: true,
      asset: { include: { contractAssets: { include: { contract: true } } } },
      contractVisit: true,
      visits: { include: { parts: { include: { part: true } } } },
    },
  });
  const completedAt =
    workOrder.visits
      .map((visit) => visit.completedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
  const labourMinutes = workOrder.visits.reduce((sum, visit) => {
    const end = visit.completedAt ?? visit.endedAt;
    return visit.startedAt && end ? sum + (end.getTime() - visit.startedAt.getTime()) / 60_000 : sum;
  }, 0);
  const coverage = chooseCoverage({
    completedAt,
    warrantyExpiresAt: workOrder.asset.warrantyExpiresAt,
    contracts: workOrder.asset.contractAssets
      .map((row) => ({
        ...row.contract,
        hasVisitsLeft:
          row.contract.includedVisits === null ||
          row.contract.usedVisits < row.contract.includedVisits ||
          workOrder.contractVisit?.contractId === row.contract.id,
      }))
      .filter((contract) => contract.customerId === workOrder.customerId),
  });
  const parts = workOrder.visits.flatMap((visit) =>
    visit.parts
      .filter((row) => row.status === "CONSUMED")
      .map((row) => ({ visitPartId: row.id, sku: row.part.sku, name: row.part.name, quantity: row.quantity, unitPrice: row.unitPrice })),
  );
  return { workOrder, coverage, labourMinutes, parts, supply: placeOfSupply(workOrder.organization, workOrder.address) };
}

// Intra- or inter-state, from the organisation's GST state and the job site's state. Both must be
// known: pricing refuses rather than guess, because the wrong split is a compliance error.
function placeOfSupply(
  organization: { gstState: string | null },
  address: { id: string; state: string },
): Supply {
  const home = gstStateByCode(organization.gstState);
  if (!home) {
    throw new AppError(
      "ORG_GST_STATE_REQUIRED",
      409,
      "Set the organisation's GST state (Admin → Master data → Company) before invoices can be priced",
    );
  }
  const site = resolveGstState(address.state);
  if (!site) {
    throw new AppError(
      "SITE_STATE_UNRECOGNISED",
      422,
      "The job site's state is not a recognised Indian state or union territory; correct the customer address",
      { addressId: address.id, state: address.state },
    );
  }
  return site.code === home.code ? "INTRA_STATE" : "INTER_STATE";
}

async function writePrice(
  tx: Tx,
  source: Awaited<ReturnType<typeof pricingSource>>,
  options: { invoiceId?: string; discount: DecimalValue; additional: { description: string; amount: DecimalValue }[]; notes?: string | null },
) {
  let priced;
  try {
    priced = priceInvoice({
      serviceTypeName: source.workOrder.serviceType.name,
      serviceCharge: source.workOrder.serviceType.serviceCharge,
      labourRatePerHour: source.workOrder.serviceType.labourRatePerHour,
      labourMinutes: source.labourMinutes,
      sacCode: source.workOrder.serviceType.sacCode,
      parts: source.parts,
      additional: options.additional,
      coverage: source.coverage,
      discount: options.discount,
      taxRatePercent: source.workOrder.organization.taxRatePercent,
      supply: source.supply,
    });
  } catch (error) {
    if (error instanceof PricingError) {
      throw new AppError("VALIDATION_ERROR", 400, error.message, { field: "discount" });
    }
    throw error;
  }
  const { lines, ...totals } = priced;
  const data = {
    ...totals,
    coverageSource: source.coverage.source,
    contractId: source.coverage.contractId ?? null,
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
  };
  const organizationId = source.workOrder.organizationId;
  const invoice = options.invoiceId
    ? await tx.invoice.update({ where: { id: options.invoiceId }, data })
    : await tx.invoice.create({
        data: { ...data, organizationId, workOrderId: source.workOrder.id, customerId: source.workOrder.customerId },
      });
  await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
  await tx.invoiceLine.createMany({ data: lines.map((line) => ({ ...line, organizationId, invoiceId: invoice.id })) });
  return invoice;
}

// Called inside the completion transaction: the system prepares a draft for ops to review.
export async function createDraftInvoice(tx: Tx, workOrderId: string) {
  const existing = await tx.invoice.findUnique({ where: { workOrderId } });
  if (existing) {
    return existing;
  }
  return writePrice(tx, await pricingSource(tx, workOrderId), { discount: 0, additional: [] });
}

async function requireInvoice(id: string, actor: AuthUser) {
  const invoice = await prisma.invoice.findFirst({ where: { id, organizationId: actor.organizationId }, include: invoiceInclude });
  if (!invoice) {
    throw new AppError("INVOICE_NOT_FOUND", 404, "Invoice not found");
  }
  if (actor.role === "CUSTOMER") {
    const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
    if (!contact || contact.customerId !== invoice.customerId) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
    }
    if (invoice.status === "DRAFT") {
      throw new AppError("INVOICE_NOT_FOUND", 404, "Invoice not found");
    }
  }
  return invoice;
}

function assertCan(action: InvoiceAction, status: Parameters<typeof canInvoice>[1]) {
  if (!canInvoice(action, status)) {
    throw new AppError("INVALID_TRANSITION", 409, `This invoice cannot be ${action === "pay" ? "paid" : action === "issue" ? "issued" : action === "void" ? "voided" : "marked overdue"}`);
  }
}

export async function listInvoices(actor: AuthUser, query: ListInvoicesQuery) {
  await markOverdue(actor.organizationId);
  let customerFilter = {};
  if (actor.role === "CUSTOMER") {
    const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
    customerFilter = { customerId: contact?.customerId ?? "none", status: { not: "DRAFT" as const } };
  }
  const where = { organizationId: actor.organizationId, ...(query.status ? { status: query.status } : {}), ...customerFilter };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { customer: { select: { id: true, name: true } }, workOrder: { select: { id: true, asset: { select: { equipmentType: true } } } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { data: rows.map(withSettlement), meta: pageMeta(total, query.page, query.limit) };
}

export async function getInvoice(id: string, actor: AuthUser) {
  await markOverdue(actor.organizationId);
  return { data: withSettlement(await requireInvoice(id, actor)) };
}

// Statuses with a downloadable PDF: anything that has been issued. A draft is not an invoice yet.
export const pdfStatuses = ["ISSUED", "OVERDUE", "PAID", "VOID"] as const;

// The stored invoice plus what the PDF prints around it. Never reprices: the figures are the ones
// saved at issue. Same access rules as reading the invoice (customers: own and not draft).
export async function invoiceForPdf(id: string, actor: AuthUser) {
  await markOverdue(actor.organizationId);
  const invoice = await requireInvoice(id, actor);
  if (!(pdfStatuses as readonly string[]).includes(invoice.status)) {
    throw new AppError("INVOICE_NOT_ISSUED", 409, "The invoice PDF is available once the invoice is issued");
  }
  const context = await prisma.workOrder.findUniqueOrThrow({
    where: { id: invoice.workOrderId },
    select: {
      organization: { select: { name: true, gstState: true } },
      address: { select: { line1: true, line2: true, city: true, state: true, postalCode: true } },
      asset: { select: { model: true } },
    },
  });
  return { ...withSettlement(invoice), ...context };
}

export async function invoiceForWorkOrder(workOrderId: string, actor: AuthUser) {
  const invoice = await prisma.invoice.findFirst({ where: { workOrderId, organizationId: actor.organizationId } });
  if (!invoice) {
    throw new AppError("INVOICE_NOT_FOUND", 404, "This job has no invoice yet");
  }
  return getInvoice(invoice.id, actor);
}

async function reprice(invoiceId: string, actor: AuthUser, change: { discount?: string; notes?: string | null; addLine?: AddLineInput }) {
  const invoice = await requireInvoice(invoiceId, actor);
  if (!editableStatuses.includes(invoice.status)) {
    throw new AppError("INVALID_TRANSITION", 409, "Only a draft invoice can change");
  }
  await prisma.$transaction(async (tx) => {
    const additional = additionalLines(invoice);
    if (change.addLine) {
      additional.push({ description: change.addLine.description, amount: new Decimal(change.addLine.amount) });
    }
    await writePrice(tx, await pricingSource(tx, invoice.workOrderId), {
      invoiceId: invoice.id,
      discount: change.discount ?? invoice.discount,
      additional,
      notes: change.notes,
    });
    const still = await tx.invoice.count({ where: { id: invoice.id, status: "DRAFT" } });
    if (still !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "Only a draft invoice can change");
    }
  });
  return getInvoice(invoice.id, actor);
}

export function updateInvoice(id: string, actor: AuthUser, input: UpdateInvoiceInput) {
  return reprice(id, actor, input);
}

export function addLine(id: string, actor: AuthUser, input: AddLineInput) {
  return reprice(id, actor, { addLine: input });
}

function additionalLines(invoice: { lines: { kind: string; description: string; amount: Prisma.Decimal }[] }) {
  return invoice.lines
    .filter((line) => line.kind === "ADDITIONAL")
    .map((line) => ({ description: line.description, amount: line.amount }));
}

export async function issueInvoice(id: string, actor: AuthUser) {
  const invoice = await requireInvoice(id, actor);
  assertCan("issue", invoice.status);
  await prisma.$transaction(async (tx) => {
    // Drafts are priced from source data, and the last pricing happens here: a site address,
    // coverage or GST state corrected since the draft was written is reflected in what is issued.
    // After this the invoice is frozen.
    const priced = await writePrice(tx, await pricingSource(tx, invoice.workOrderId), {
      invoiceId: invoice.id,
      discount: invoice.discount,
      additional: additionalLines(invoice),
    });
    const organization = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { invoiceSequence: { increment: 1 } },
    });
    const now = new Date();
    const free = new Decimal(priced.total).eq(0);
    const moved = await tx.invoice.updateMany({
      where: { id: invoice.id, status: "DRAFT" },
      data: {
        // Nothing to collect on a fully covered job.
        status: free ? "PAID" : "ISSUED",
        number: `INV-${now.getUTCFullYear()}-${String(organization.invoiceSequence).padStart(5, "0")}`,
        issuedAt: now,
        dueAt: new Date(now.getTime() + organization.paymentTermsDays * 86_400_000),
        ...(free ? { paidAt: now } : {}),
      },
    });
    if (moved.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This invoice cannot be issued");
    }
  });
  await notify(() => invoiceEvent("invoice.generated", invoice.id));
  return getInvoice(invoice.id, actor);
}

async function applyPayment(
  invoiceId: string,
  actor: AuthUser,
  payment: { amount: Prisma.Decimal; method: RecordPaymentInput["method"] | "ONLINE"; reference?: string; provider?: string; paidAt: Date },
) {
  await prisma.$transaction(async (tx) => {
    const locked = await lockInvoice(tx, invoiceId);
    assertCan("pay", locked.status);
    const { balance } = settlementOf(locked);
    if (payment.amount.gt(balance)) {
      throw new AppError("PAYMENT_EXCEEDS_BALANCE", 409, "The payment is more than the balance due", { balance: balance.toFixed(2) });
    }
    await tx.payment.create({
      data: {
        organizationId: actor.organizationId,
        invoiceId,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        provider: payment.provider,
        paidAt: payment.paidAt,
        recordedById: actor.id,
      },
    });
    const amountPaid = new Decimal(locked.amountPaid).add(payment.amount);
    const settled = settlementOf({ ...locked, amountPaid }).owed.lte(0);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid, ...(settled ? { status: "PAID", paidAt: payment.paidAt } : {}) },
    });
  });
  await notify(() => invoiceEvent("payment.received", invoiceId, payment.amount.toFixed(2)));
}

export async function recordPayment(id: string, actor: AuthUser, input: RecordPaymentInput) {
  const invoice = await requireInvoice(id, actor);
  assertCan("pay", invoice.status);
  await applyPayment(invoice.id, actor, {
    amount: new Decimal(input.amount),
    method: input.method,
    reference: input.reference,
    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
  });
  return getInvoice(invoice.id, actor);
}

// The customer pays the balance online through the payment provider (mocked locally).
export async function payOnline(id: string, actor: AuthUser) {
  const invoice = await requireInvoice(id, actor);
  if (actor.role !== "CUSTOMER") {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  assertCan("pay", invoice.status);
  const { balance } = settlementOf(invoice);
  const result = await charge({ invoiceId: invoice.id, amount: balance.toFixed(2), currency: invoice.currency });
  await applyPayment(invoice.id, actor, {
    amount: balance,
    method: "ONLINE",
    reference: result.reference,
    provider: result.provider,
    paidAt: new Date(),
  });
  return getInvoice(invoice.id, actor);
}

export async function voidInvoice(id: string, actor: AuthUser, reason: string) {
  const invoice = await requireInvoice(id, actor);
  assertCan("void", invoice.status);
  if (invoice.payments.length > 0) {
    throw new AppError("INVALID_TRANSITION", 409, "An invoice with payments cannot be voided");
  }
  if (invoice.creditNotes.length > 0) {
    throw new AppError("INVALID_TRANSITION", 409, "An invoice with credit notes cannot be voided");
  }
  const moved = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: invoice.status, amountPaid: 0, creditedTotal: 0 },
    data: { status: "VOID", voidedAt: new Date(), notes: [invoice.notes, `Voided: ${reason}`].filter(Boolean).join("\n") },
  });
  if (moved.count !== 1) {
    throw new AppError("INVALID_TRANSITION", 409, "This invoice cannot be voided");
  }
  return getInvoice(invoice.id, actor);
}

// Issued invoices past their due date become OVERDUE. Runs before reads and on a timer.
// Only invoices that still owe something: the same balance as settlementOf, in SQL.
export async function markOverdue(organizationId?: string, now = new Date()) {
  return prisma.$executeRaw`
    UPDATE "Invoice" SET "status" = 'OVERDUE', "updatedAt" = NOW()
    WHERE "status" = 'ISSUED' AND "dueAt" < ${now}
      AND ("total" - "creditedTotal") - ("amountPaid" - "refundedTotal") > 0
      ${organizationId ? Prisma.sql`AND "organizationId" = ${organizationId}` : Prisma.empty}`;
}

type Locked = Ledger & { dueAt: Date | null; currency: string };

// Reads the invoice's money columns with a row lock, so concurrent payments, credits and refunds on
// one invoice run one after another and each sees the previous one's result.
async function lockInvoice(tx: Tx, invoiceId: string): Promise<Locked> {
  const [row] = await tx.$queryRaw<(Omit<Locked, "status"> & { status: string })[]>`
    SELECT "status", "total"::text, "creditedTotal"::text, "amountPaid"::text, "refundedTotal"::text, "dueAt", "currency"
    FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
  return { ...row!, status: row!.status as Locked["status"] };
}

async function nextNumber(tx: Tx, organizationId: string, kind: "creditNoteSequence" | "refundSequence", now: Date) {
  const organization = await tx.organization.update({ where: { id: organizationId }, data: { [kind]: { increment: 1 } } });
  const prefix = kind === "creditNoteSequence" ? "CN" : "RF";
  return `${prefix}-${now.getUTCFullYear()}-${String(organization[kind]).padStart(5, "0")}`;
}

// A credit note lowers what the customer owes, up to what is left of the total after earlier
// credits. The invoice's lines and total never change. Settling the balance marks it PAID; a credit
// on an invoice already paid leaves a refund due.
export async function issueCreditNote(id: string, actor: AuthUser, input: AdjustmentInput) {
  const invoice = await requireInvoice(id, actor);
  const amount = new Decimal(input.amount);
  await prisma.$transaction(async (tx) => {
    const locked = await lockInvoice(tx, invoice.id);
    if (!creditStatuses.includes(locked.status)) {
      throw new AppError("INVALID_TRANSITION", 409, "Only an issued, overdue or paid invoice can be credited");
    }
    const { creditable } = settlementOf(locked);
    if (amount.gt(creditable)) {
      throw new AppError("CREDIT_EXCEEDS_REMAINING", 409, "The credit is more than what is left of the invoice total", {
        creditable: creditable.toFixed(2),
      });
    }
    const now = new Date();
    await tx.creditNote.create({
      data: {
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        number: await nextNumber(tx, actor.organizationId, "creditNoteSequence", now),
        amount,
        currency: locked.currency,
        reason: input.reason,
        createdById: actor.id,
      },
    });
    const creditedTotal = new Decimal(locked.creditedTotal).add(amount);
    const next = statusAfter(locked.status, settlementOf({ ...locked, creditedTotal }).owed, locked.dueAt, now);
    await tx.invoice.update({ where: { id: invoice.id }, data: { creditedTotal, ...next } });
  });
  return getInvoice(invoice.id, actor);
}

// A refund pays money back against the invoice's payments, up to what was paid less earlier refunds.
// Payments are kept. If the customer owes again, a PAID invoice goes back to ISSUED or OVERDUE.
export async function issueRefund(id: string, actor: AuthUser, input: AdjustmentInput) {
  const invoice = await requireInvoice(id, actor);
  const amount = new Decimal(input.amount);
  await prisma.$transaction(async (tx) => {
    const locked = await lockInvoice(tx, invoice.id);
    if (!refundStatuses.includes(locked.status)) {
      throw new AppError("INVALID_TRANSITION", 409, "Only an issued, overdue or paid invoice can be refunded");
    }
    const { refundable } = settlementOf(locked);
    if (amount.gt(refundable)) {
      throw new AppError("REFUND_EXCEEDS_PAID", 409, "The refund is more than what was paid less earlier refunds", {
        refundable: refundable.toFixed(2),
      });
    }
    const now = new Date();
    await tx.refund.create({
      data: {
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        number: await nextNumber(tx, actor.organizationId, "refundSequence", now),
        amount,
        currency: locked.currency,
        reason: input.reason,
        createdById: actor.id,
      },
    });
    const refundedTotal = new Decimal(locked.refundedTotal).add(amount);
    const next = statusAfter(locked.status, settlementOf({ ...locked, refundedTotal }).owed, locked.dueAt, now);
    await tx.invoice.update({ where: { id: invoice.id }, data: { refundedTotal, ...next } });
  });
  return getInvoice(invoice.id, actor);
}
