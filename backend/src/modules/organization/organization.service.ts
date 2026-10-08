import { gstStateByCode, gstStates } from "../../lib/gstStates.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/authUser.js";
import type { UpdateOrganizationInput } from "./organization.schema.js";

async function view(organizationId: string) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, name: true, gstState: true, taxRatePercent: true, paymentTermsDays: true },
  });
  return {
    data: { ...organization, gstStateName: gstStateByCode(organization.gstState)?.name ?? null },
  };
}

export function getOrganization(actor: AuthUser) {
  return view(actor.organizationId);
}

export async function updateOrganization(actor: AuthUser, input: UpdateOrganizationInput) {
  await prisma.organization.update({ where: { id: actor.organizationId }, data: input });
  return view(actor.organizationId);
}

export function listGstStates() {
  return { data: gstStates.map(({ code, abbreviation, name }) => ({ code, abbreviation, name })) };
}
