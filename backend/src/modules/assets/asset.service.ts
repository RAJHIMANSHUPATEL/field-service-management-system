import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { toDate, type CreateAssetInput, type ListAssetsQuery, type UpdateAssetInput } from "./asset.schema.js";

async function customerIdForUser(userId: string) {
  const contact = await prisma.customerContact.findUnique({
    where: { userId },
    select: { customerId: true },
  });
  return contact?.customerId;
}

function assertCustomerAccess(actor: AuthUser, customerId: string, linkedCustomerId: string | undefined) {
  if (actor.role === "CUSTOMER" && linkedCustomerId !== customerId) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
}

export async function listAssets(actor: AuthUser, query: ListAssetsQuery) {
  const linkedCustomerId = actor.role === "CUSTOMER" ? await customerIdForUser(actor.id) : undefined;
  if (query.customerId) {
    assertCustomerAccess(actor, query.customerId, linkedCustomerId);
  }

  const where = {
    organizationId: actor.organizationId,
    ...(actor.role === "CUSTOMER" ? { customerId: linkedCustomerId ?? "__none__" } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };

  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: { address: true, customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: assets, meta: pageMeta(total, query.page, query.limit) };
}

export async function getAsset(id: string, actor: AuthUser) {
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { address: true },
  });
  if (!asset) {
    throw new AppError("ASSET_NOT_FOUND", 404, "Asset not found");
  }
  if (actor.role === "CUSTOMER") {
    const linkedCustomerId = await customerIdForUser(actor.id);
    assertCustomerAccess(actor, asset.customerId, linkedCustomerId);
  }
  return { data: asset };
}

async function requireAddress(customerId: string, addressId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) {
    throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
  }
  const address = await prisma.address.findFirst({
    where: { id: addressId, customerId },
  });
  if (!address) {
    throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
  }
}

export async function createAsset(input: CreateAssetInput, actor: AuthUser) {
  await requireAddress(input.customerId, input.addressId, actor.organizationId);
  const existing = await prisma.asset.findFirst({
    where: { organizationId: actor.organizationId, serialNumber: input.serialNumber },
  });
  if (existing) {
    throw new AppError("SERIAL_IN_USE", 409, "An asset with this serial number already exists");
  }

  const asset = await prisma.asset.create({
    data: {
      organizationId: actor.organizationId,
      customerId: input.customerId,
      addressId: input.addressId,
      equipmentType: input.equipmentType,
      model: input.model,
      serialNumber: input.serialNumber,
      installedAt: toDate(input.installedAt),
      warrantyExpiresAt: toDate(input.warrantyExpiresAt),
      status: input.status ?? "ACTIVE",
    },
    include: { address: true },
  });
  return { data: asset };
}

export async function updateAsset(id: string, input: UpdateAssetInput, actor: AuthUser) {
  const current = await prisma.asset.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!current) {
    throw new AppError("ASSET_NOT_FOUND", 404, "Asset not found");
  }
  if (input.addressId) {
    await requireAddress(current.customerId, input.addressId, actor.organizationId);
  }
  if (input.serialNumber && input.serialNumber !== current.serialNumber) {
    const existing = await prisma.asset.findFirst({
      where: { organizationId: actor.organizationId, serialNumber: input.serialNumber },
    });
    if (existing) {
      throw new AppError("SERIAL_IN_USE", 409, "An asset with this serial number already exists");
    }
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...(input.addressId !== undefined ? { addressId: input.addressId } : {}),
      ...(input.equipmentType !== undefined ? { equipmentType: input.equipmentType } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
      ...(input.installedAt !== undefined ? { installedAt: toDate(input.installedAt) } : {}),
      ...(input.warrantyExpiresAt !== undefined
        ? { warrantyExpiresAt: toDate(input.warrantyExpiresAt) }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include: { address: true },
  });
  return { data: asset };
}
