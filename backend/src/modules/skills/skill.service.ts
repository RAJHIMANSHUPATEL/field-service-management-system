import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateSkillInput, UpdateSkillInput } from "./skill.schema.js";

async function assertUnique(actor: AuthUser, value: string | undefined, id?: string) {
  if (!value) {
    return;
  }
  const existing = await prisma.skill.findFirst({
    where: { organizationId: actor.organizationId, name: value, ...(id ? { NOT: { id } } : {}) },
  });
  if (existing) {
    throw new AppError("SKILL_EXISTS", 409, "A skill with this name already exists");
  }
}

export async function listSkills(actor: AuthUser, pageQuery: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, rows] = await Promise.all([
    prisma.skill.count({ where }),
    prisma.skill.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: rows, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getSkill(id: string, actor: AuthUser) {
  const row = await prisma.skill.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!row) {
    throw new AppError("SKILL_NOT_FOUND", 404, "Skill not found");
  }
  return { data: row };
}

export async function createSkill(input: CreateSkillInput, actor: AuthUser) {
  await assertUnique(actor, input.name);
  const row = await prisma.skill.create({
    data: { ...input, organizationId: actor.organizationId },
  });
  return { data: row };
}

export async function updateSkill(id: string, input: UpdateSkillInput, actor: AuthUser) {
  const current = await getSkill(id, actor);
  await assertUnique(actor, input.name, id);
  const row = await prisma.skill.update({ where: { id: current.data.id }, data: input });
  return { data: row };
}
