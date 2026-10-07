import argon2 from "argon2";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateTechnicianInput, UpdateTechnicianInput } from "./technician.schema.js";

const technicianInclude = {
  user: {
    select: { id: true, name: true, email: true, role: true },
  },
};

function assertOwnProfile(actor: AuthUser, userId: string) {
  if (actor.role === "TECHNICIAN" && actor.id !== userId) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
}

export async function listTechnicians(actor: AuthUser, pageQuery: PageQuery) {
  const where = {
    organizationId: actor.organizationId,
    ...(actor.role === "TECHNICIAN" ? { userId: actor.id } : {}),
  };
  const [total, technicians] = await Promise.all([
    prisma.technician.count({ where }),
    prisma.technician.findMany({
      where,
      include: technicianInclude,
      orderBy: { createdAt: "desc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);
  return { data: technicians, meta: pageMeta(total, pageQuery.page, pageQuery.limit) };
}

export async function getTechnician(id: string, actor: AuthUser) {
  const technician = await prisma.technician.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: technicianInclude,
  });
  if (!technician) {
    throw new AppError("TECHNICIAN_NOT_FOUND", 404, "Technician not found");
  }
  assertOwnProfile(actor, technician.userId);
  return { data: technician };
}

export async function createTechnician(input: CreateTechnicianInput, actor: AuthUser) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { organizationId: actor.organizationId, email },
  });
  if (existing) {
    throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
  }

  const technician = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: actor.organizationId,
        email,
        name: input.name,
        role: "TECHNICIAN",
        passwordHash: await argon2.hash(input.password),
      },
    });
    return tx.technician.create({
      data: {
        organizationId: actor.organizationId,
        userId: user.id,
        phone: input.phone,
      },
      include: technicianInclude,
    });
  });

  return { data: technician };
}

export async function updateTechnician(id: string, input: UpdateTechnicianInput, actor: AuthUser) {
  await getTechnician(id, actor);
  const technician = await prisma.technician.update({
    where: { id },
    data: {
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: technicianInclude,
  });
  return { data: technician };
}
