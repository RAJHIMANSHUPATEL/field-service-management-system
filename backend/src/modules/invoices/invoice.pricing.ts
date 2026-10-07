import { Prisma } from "../../generated/prisma/client.js";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
export type DecimalValue = string | number | Prisma.Decimal;

export type Coverage = {
  source: "NONE" | "WARRANTY" | "CONTRACT";
  contractId?: string;
  serviceChargePercent: number;
  labourPercent: number;
  partsPercent: number;
};

export const noCoverage: Coverage = { source: "NONE", serviceChargePercent: 0, labourPercent: 0, partsPercent: 0 };

export type PricingInput = {
  serviceTypeName: string;
  serviceCharge: DecimalValue;
  labourRatePerHour: DecimalValue;
  labourMinutes: number;
  sacCode?: string | null;
  parts: { visitPartId: string; sku: string; name: string; quantity: number; unitPrice: DecimalValue }[];
  additional: { description: string; amount: DecimalValue }[];
  coverage: Coverage;
  discount: DecimalValue;
  taxRatePercent: DecimalValue;
};

export type PricedLine = {
  kind: "SERVICE_CHARGE" | "LABOUR" | "PART" | "ADDITIONAL";
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  amount: Decimal;
  coveredAmount: Decimal;
  sacCode: string | null;
  visitPartId: string | null;
  position: number;
};

function money(value: DecimalValue) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function percentOf(amount: Decimal, percent: number) {
  return money(amount.mul(percent).div(100));
}

// Labour is billed in half hours, rounded up, with at least half an hour per job.
export function billableHours(minutes: number) {
  return new Decimal(Math.max(1, Math.ceil(minutes / 30))).div(2);
}

export class PricingError extends Error {}

// Pure invoice arithmetic: lines, coverage per line, discount, then CGST and SGST halves of the
// tax rate on what is left (intra-state supply).
export function priceInvoice(input: PricingInput) {
  const lines: PricedLine[] = [];
  const push = (line: Omit<PricedLine, "position">) => lines.push({ ...line, position: lines.length });
  const sacCode = input.sacCode ?? null;

  const serviceCharge = money(input.serviceCharge);
  if (serviceCharge.gt(0)) {
    push({
      kind: "SERVICE_CHARGE",
      description: `Service charge · ${input.serviceTypeName}`,
      quantity: new Decimal(1),
      unitPrice: serviceCharge,
      amount: serviceCharge,
      coveredAmount: percentOf(serviceCharge, input.coverage.serviceChargePercent),
      sacCode,
      visitPartId: null,
    });
  }
  const rate = money(input.labourRatePerHour);
  if (rate.gt(0)) {
    const hours = billableHours(input.labourMinutes);
    const amount = money(rate.mul(hours));
    push({
      kind: "LABOUR",
      description: `Labour (${hours.toString()} h)`,
      quantity: hours,
      unitPrice: rate,
      amount,
      coveredAmount: percentOf(amount, input.coverage.labourPercent),
      sacCode,
      visitPartId: null,
    });
  }
  for (const part of input.parts) {
    const unitPrice = money(part.unitPrice);
    const amount = money(unitPrice.mul(part.quantity));
    push({
      kind: "PART",
      description: `${part.name} (${part.sku})`,
      quantity: new Decimal(part.quantity),
      unitPrice,
      amount,
      coveredAmount: percentOf(amount, input.coverage.partsPercent),
      sacCode: null,
      visitPartId: part.visitPartId,
    });
  }
  for (const extra of input.additional) {
    const amount = money(extra.amount);
    push({
      kind: "ADDITIONAL",
      description: extra.description,
      quantity: new Decimal(1),
      unitPrice: amount,
      amount,
      coveredAmount: new Decimal(0),
      sacCode,
      visitPartId: null,
    });
  }

  const subtotal = money(lines.reduce((sum, line) => sum.add(line.amount), new Decimal(0)));
  const coveredTotal = money(lines.reduce((sum, line) => sum.add(line.coveredAmount), new Decimal(0)));
  const discount = money(input.discount);
  const billable = subtotal.sub(coveredTotal);
  if (discount.lt(0) || discount.gt(billable)) {
    throw new PricingError("The discount cannot be more than the billable amount");
  }
  const taxableAmount = money(billable.sub(discount));
  const taxRatePercent = new Decimal(input.taxRatePercent);
  const cgst = percentOf(taxableAmount, taxRatePercent.div(2).toNumber());
  const sgst = cgst;
  const taxTotal = money(cgst.add(sgst));
  const total = money(taxableAmount.add(taxTotal));
  return { lines, subtotal, coveredTotal, discount, taxableAmount, taxRatePercent, cgst, sgst, taxTotal, total };
}

// Warranty first: a job on equipment still under warranty costs the customer nothing.
// Otherwise the active contract covering the asset on the completion date applies.
export function chooseCoverage(input: {
  completedAt: Date;
  warrantyExpiresAt: Date | null;
  contracts: {
    id: string;
    startsOn: Date;
    endsOn: Date;
    status: string;
    serviceChargeCoveredPercent: number;
    labourCoveredPercent: number;
    partsCoveredPercent: number;
  }[];
}): Coverage {
  if (input.warrantyExpiresAt && input.warrantyExpiresAt.getTime() >= input.completedAt.getTime()) {
    return { source: "WARRANTY", serviceChargePercent: 100, labourPercent: 100, partsPercent: 100 };
  }
  const active = input.contracts
    .filter(
      (contract) =>
        contract.status === "ACTIVE" &&
        contract.startsOn.getTime() <= input.completedAt.getTime() &&
        contract.endsOn.getTime() >= input.completedAt.getTime(),
    )
    .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())[0];
  if (!active) {
    return noCoverage;
  }
  return {
    source: "CONTRACT",
    contractId: active.id,
    serviceChargePercent: active.serviceChargeCoveredPercent,
    labourPercent: active.labourCoveredPercent,
    partsPercent: active.partsCoveredPercent,
  };
}
