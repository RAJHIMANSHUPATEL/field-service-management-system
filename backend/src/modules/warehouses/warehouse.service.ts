import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "./warehouse.schema.js";

async function checkVan(input: { kind?: "WAREHOUSE" | "VAN"; technicianId?: string | null }, actor: AuthUser, id?: string) {
  if (input.kind === "VAN" && !input.technicianId) {
    throw new AppError("VALIDATION_ERROR", 400, "A van belongs to a technician");
  }
  if (input.kind === "WAREHOUSE" && input.technicianId) {
    throw new AppError("VALIDATION_ERROR", 400, "Only a van belongs to a technician");
  }
  if (input.technicianId) {
    const technician = await prisma.technician.findFirst({
      where: { id: input.technicianId, organizationId: actor.organizationId },
    });
    if (!technician) {
      throw new AppError("TECHNICIAN_NOT_FOUND", 404, "Technician not found");
    }
    const taken = await prisma.warehouse.findFirst({
      where: { technicianId: input.technicianId, ...(id ? { NOT: { id } } : {}) },
    });
    if (taken) {
      throw new AppError("VAN_EXISTS", 409, "This technician already has a van");
    }
  }
}

async function assertUnique(actor: AuthUser, value: string | undefined, id?: string) {
  if (!value) {
    return;
  }
  const existing = await prisma.warehouse.findFirst({
    where: { organizationId: actor.organizationId, name: value, ...(id ? { NOT: { id } } : {}) },
  });
  if (existing) {
    throw new AppError("WAREHOUSE_EXISTS", 409, "A warehouse with this name already exists");
  }
}

export async function listWarehouses(actor: AuthUser, pageQuery: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, rows] = await Promise.all([
    prisma.warehouse.count({ where }),
    prisma.warehouse.findMany({
      where, include: { technician: { select: { id: true, user: { select: { name: true } } } } },
      orderBy: { name: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: rows, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getWarehouse(id: string, actor: AuthUser) {
  const row = await prisma.warehouse.findFirst({ where: { id, organizationId: actor.organizationId }, include: { technician: { select: { id: true, user: { select: { name: true } } } } } });
  if (!row) {
    throw new AppError("WAREHOUSE_NOT_FOUND", 404, "Warehouse not found");
  }
  return { data: row };
}

export async function createWarehouse(input: CreateWarehouseInput, actor: AuthUser) {
  await assertUnique(actor, input.name);
  await checkVan(input, actor);
  const row = await prisma.warehouse.create({
    data: { ...input, organizationId: actor.organizationId }, include: { technician: { select: { id: true, user: { select: { name: true } } } } },
  });
  return { data: row };
}

export async function updateWarehouse(id: string, input: UpdateWarehouseInput, actor: AuthUser) {
  const current = await getWarehouse(id, actor);
  await assertUnique(actor, input.name, id);
  await checkVan({ kind: input.kind ?? current.data.kind, technicianId: input.technicianId === undefined ? current.data.technicianId : input.technicianId }, actor, id);
  const row = await prisma.warehouse.update({ where: { id: current.data.id }, data: input, include: { technician: { select: { id: true, user: { select: { name: true } } } } } });
  return { data: row };
}
