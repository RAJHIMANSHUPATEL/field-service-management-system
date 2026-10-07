import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateContractInput } from "./contract.schema.js";
import { contractTransitions } from "./contract.transitions.js";

const include = {
  customer: { select: { id: true, name: true } },
  assets: { select: { asset: { select: { id: true, equipmentType: true, serialNumber: true } } } },
};

// Dates are whole days: a contract covers from the start of startsOn to the end of endsOn (UTC).
function dayStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function dayEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`);
}

async function customerScope(actor: AuthUser) {
  if (actor.role !== "CUSTOMER") {
    return {};
  }
  const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
  return { customerId: contact?.customerId ?? "none" };
}

export async function listContracts(actor: AuthUser, customerId?: string) {
  const rows = await prisma.serviceContract.findMany({
    where: { organizationId: actor.organizationId, ...(customerId ? { customerId } : {}), ...(await customerScope(actor)) },
    orderBy: { startsOn: "desc" },
    include,
  });
  return { data: rows };
}

export async function getContract(id: string, actor: AuthUser) {
  const contract = await prisma.serviceContract.findFirst({
    where: { id, organizationId: actor.organizationId, ...(await customerScope(actor)) },
    include,
  });
  if (!contract) {
    throw new AppError("CONTRACT_NOT_FOUND", 404, "Contract not found");
  }
  return { data: contract };
}

export async function createContract(actor: AuthUser, input: CreateContractInput) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId } });
  if (!customer) {
    throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
  }
  const assets = await prisma.asset.findMany({
    where: { id: { in: input.assetIds }, organizationId: actor.organizationId, customerId: customer.id },
  });
  if (assets.length !== new Set(input.assetIds).size) {
    throw new AppError("VALIDATION_ERROR", 400, "Every asset must belong to this customer", { field: "assetIds" });
  }
  const contract = await prisma.serviceContract.create({
    data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      name: input.name,
      startsOn: dayStart(input.startsOn),
      endsOn: dayEnd(input.endsOn),
      serviceChargeCoveredPercent: input.serviceChargeCoveredPercent,
      labourCoveredPercent: input.labourCoveredPercent,
      partsCoveredPercent: input.partsCoveredPercent,
      assets: { create: assets.map((asset) => ({ assetId: asset.id })) },
    },
    include,
  });
  return { data: contract };
}

export async function cancelContract(id: string, actor: AuthUser) {
  const { data: contract } = await getContract(id, actor);
  const { from, to } = contractTransitions.cancel;
  const moved = await prisma.serviceContract.updateMany({
    where: { id: contract.id, status: { in: from } },
    data: { status: to },
  });
  if (moved.count !== 1) {
    throw new AppError("INVALID_TRANSITION", 409, "This contract is already cancelled");
  }
  return getContract(contract.id, actor);
}
