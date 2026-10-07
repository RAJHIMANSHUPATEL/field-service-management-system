import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreatePartInput, UpdatePartInput } from "./part.schema.js";

async function assertUnique(actor: AuthUser, value: string | undefined, id?: string) {
  if (!value) {
    return;
  }
  const existing = await prisma.part.findFirst({
    where: { organizationId: actor.organizationId, sku: value, ...(id ? { NOT: { id } } : {}) },
  });
  if (existing) {
    throw new AppError("PART_EXISTS", 409, "A part with this sku already exists");
  }
}

export async function listParts(actor: AuthUser, pageQuery: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, rows] = await Promise.all([
    prisma.part.count({ where }),
    prisma.part.findMany({
      where,
      orderBy: { sku: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: rows, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getPart(id: string, actor: AuthUser) {
  const row = await prisma.part.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!row) {
    throw new AppError("PART_NOT_FOUND", 404, "Part not found");
  }
  return { data: row };
}

export async function createPart(input: CreatePartInput, actor: AuthUser) {
  await assertUnique(actor, input.sku);
  const row = await prisma.part.create({
    data: { ...input, organizationId: actor.organizationId },
  });
  return { data: row };
}

export async function updatePart(id: string, input: UpdatePartInput, actor: AuthUser) {
  const current = await getPart(id, actor);
  await assertUnique(actor, input.sku, id);
  const row = await prisma.part.update({ where: { id: current.data.id }, data: input });
  return { data: row };
}
