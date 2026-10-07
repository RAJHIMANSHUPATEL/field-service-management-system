import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateServiceTypeInput, UpdateServiceTypeInput } from "./serviceType.schema.js";

export async function listServiceTypes(actor: AuthUser, pageQuery: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, serviceTypes] = await Promise.all([
    prisma.serviceType.count({ where }),
    prisma.serviceType.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: serviceTypes, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getServiceType(id: string, actor: AuthUser) {
  const serviceType = await prisma.serviceType.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!serviceType) {
    throw new AppError("SERVICE_TYPE_NOT_FOUND", 404, "Service type not found");
  }
  return { data: serviceType };
}

async function assertSkill(actor: AuthUser, skillId: string | null | undefined) {
  if (skillId && !(await prisma.skill.findFirst({ where: { id: skillId, organizationId: actor.organizationId } }))) {
    throw new AppError("SKILL_NOT_FOUND", 404, "Skill not found");
  }
}

export async function createServiceType(input: CreateServiceTypeInput, actor: AuthUser) {
  await assertSkill(actor, input.requiredSkillId);
  const existing = await prisma.serviceType.findFirst({
    where: { organizationId: actor.organizationId, name: input.name },
  });
  if (existing) {
    throw new AppError("SERVICE_TYPE_EXISTS", 409, "A service type with this name already exists");
  }
  const serviceType = await prisma.serviceType.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
      requiredSkillId: input.requiredSkillId ?? null,
      serviceCharge: input.serviceCharge ?? "0",
      labourRatePerHour: input.labourRatePerHour ?? "0",
      sacCode: input.sacCode ?? null,
    },
  });
  return { data: serviceType };
}

export async function updateServiceType(id: string, input: UpdateServiceTypeInput, actor: AuthUser) {
  await getServiceType(id, actor);
  await assertSkill(actor, input.requiredSkillId);
  if (input.name) {
    const existing = await prisma.serviceType.findFirst({
      where: {
        organizationId: actor.organizationId,
        name: input.name,
        NOT: { id },
      },
    });
    if (existing) {
      throw new AppError("SERVICE_TYPE_EXISTS", 409, "A service type with this name already exists");
    }
  }
  const serviceType = await prisma.serviceType.update({
    where: { id },
    data: input,
  });
  return { data: serviceType };
}
