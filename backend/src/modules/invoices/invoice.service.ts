import { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { charge } from "../../lib/payments.js";
import { prisma } from "../../lib/prisma.js";
import { chooseCoverage, priceInvoice, PricingError, type DecimalValue } from "./invoice.pricing.js";
import type { AddLineInput, ListInvoicesQuery, RecordPaymentInput, UpdateInvoiceInput } from "./invoice.schema.js";
import { canInvoice, editableStatuses, type InvoiceAction } from "./invoice.transitions.js";

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
};

// Everything the price depends on, read at the time of pricing.
async function pricingSource(tx: Tx, workOrderId: string) {
  const workOrder = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: {
      organization: true,
      serviceType: true,
      asset: { include: { contractAssets: { include: { contract: true } } } },
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
      .map((row) => row.contract)
      .filter((contract) => contract.customerId === workOrder.customerId),
  });
  const parts = workOrder.visits.flatMap((visit) =>
    visit.parts
      .filter((row) => row.status === "CONSUMED")
      .map((row) => ({ visitPartId: row.id, sku: row.part.sku, name: row.part.name, quantity: row.quantity, unitPrice: row.unitPrice })),
  );
  return { workOrder, coverage, labourMinutes, parts };
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
  const rows = await prisma.invoice.findMany({
    where: { organizationId: actor.organizationId, ...(query.status ? { status: query.status } : {}), ...customerFilter },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { id: true, name: true } }, workOrder: { select: { id: true, asset: { select: { equipmentType: true } } } } },
  });
  return { data: rows };
}

export async function getInvoice(id: string, actor: AuthUser) {
  await markOverdue(actor.organizationId);
  return { data: await requireInvoice(id, actor) };
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
    const additional = invoice.lines
      .filter((line) => line.kind === "ADDITIONAL")
      .map((line) => ({ description: line.description, amount: line.amount }));
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

export async function issueInvoice(id: string, actor: AuthUser) {
  const invoice = await requireInvoice(id, actor);
  assertCan("issue", invoice.status);
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: actor.organizationId },
      data: { invoiceSequence: { increment: 1 } },
    });
    const now = new Date();
    const free = new Decimal(invoice.total).eq(0);
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
  return getInvoice(invoice.id, actor);
}

async function applyPayment(
  invoiceId: string,
  actor: AuthUser,
  payment: { amount: Prisma.Decimal; method: RecordPaymentInput["method"] | "ONLINE"; reference?: string; provider?: string; paidAt: Date },
) {
  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string; total: string; amountPaid: string }[]>`
      SELECT "status", "total"::text, "amountPaid"::text FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
    assertCan("pay", locked!.status as never);
    const balance = new Decimal(locked!.total).sub(locked!.amountPaid);
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
    const amountPaid = new Decimal(locked!.amountPaid).add(payment.amount);
    const settled = amountPaid.eq(locked!.total);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid, ...(settled ? { status: "PAID", paidAt: payment.paidAt } : {}) },
    });
  });
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
  const balance = new Decimal(invoice.total).sub(invoice.amountPaid);
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
  const moved = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: invoice.status, amountPaid: 0 },
    data: { status: "VOID", voidedAt: new Date(), notes: [invoice.notes, `Voided: ${reason}`].filter(Boolean).join("\n") },
  });
  if (moved.count !== 1) {
    throw new AppError("INVALID_TRANSITION", 409, "This invoice cannot be voided");
  }
  return getInvoice(invoice.id, actor);
}

// Issued invoices past their due date become OVERDUE. Runs before reads and on a timer.
export async function markOverdue(organizationId?: string, now = new Date()) {
  const result = await prisma.invoice.updateMany({
    where: { ...(organizationId ? { organizationId } : {}), status: "ISSUED", dueAt: { lt: now } },
    data: { status: "OVERDUE" },
  });
  return result.count;
}
