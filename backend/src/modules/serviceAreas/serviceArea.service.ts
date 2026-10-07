import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateServiceAreaInput, UpdateServiceAreaInput } from "./serviceArea.schema.js";

async function assertUnique(actor: AuthUser, value: string | undefined, id?: string) {
  if (!value) {
    return;
  }
  const existing = await prisma.serviceArea.findFirst({
    where: { organizationId: actor.organizationId, name: value, ...(id ? { NOT: { id } } : {}) },
  });
  if (existing) {
    throw new AppError("SERVICE_AREA_EXISTS", 409, "A service area with this name already exists");
  }
}

export async function listServiceAreas(actor: AuthUser, pageQuery: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, rows] = await Promise.all([
    prisma.serviceArea.count({ where }),
    prisma.serviceArea.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: rows, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getServiceArea(id: string, actor: AuthUser) {
  const row = await prisma.serviceArea.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!row) {
    throw new AppError("SERVICE_AREA_NOT_FOUND", 404, "Service area not found");
  }
  return { data: row };
}

export async function createServiceArea(input: CreateServiceAreaInput, actor: AuthUser) {
  await assertUnique(actor, input.name);
  const row = await prisma.serviceArea.create({
    data: { ...input, organizationId: actor.organizationId },
  });
  return { data: row };
}

export async function updateServiceArea(id: string, input: UpdateServiceAreaInput, actor: AuthUser) {
  const current = await getServiceArea(id, actor);
  await assertUnique(actor, input.name, id);
  const row = await prisma.serviceArea.update({ where: { id: current.data.id }, data: input });
  return { data: row };
}
