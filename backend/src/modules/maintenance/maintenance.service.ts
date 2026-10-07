import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { createOpenWorkOrder } from "../workOrders/workOrder.service.js";
import { notify, requestEvent } from "../notifications/notification.events.js";
import type { CreatePlanInput, UpdatePlanInput } from "./maintenance.schema.js";
import { DAY_MS, isDue, nextDueAfter, openWorkOrderStatuses, planTransitions, type PlanAction } from "./maintenance.transitions.js";

const include = {
  customer: { select: { id: true, name: true } },
  asset: { select: { id: true, equipmentType: true, serialNumber: true } },
  serviceType: { select: { id: true, name: true } },
  contract: { select: { id: true, name: true, status: true, endsOn: true } },
  workOrders: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
    select: { id: true, status: true, createdAt: true, requestId: true },
  },
};

function day(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

async function customerScope(actor: AuthUser) {
  if (actor.role !== "CUSTOMER") {
    return {};
  }
  const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
  return { customerId: contact?.customerId ?? "none" };
}

export async function listPlans(actor: AuthUser, query: { customerId?: string; contractId?: string }) {
  const rows = await prisma.maintenancePlan.findMany({
    where: { organizationId: actor.organizationId, ...query, ...(await customerScope(actor)) },
    orderBy: { nextDueOn: "asc" },
    include,
  });
  return { data: rows };
}

export async function getPlan(id: string, actor: AuthUser) {
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id, organizationId: actor.organizationId, ...(await customerScope(actor)) },
    include,
  });
  if (!plan) {
    throw new AppError("MAINTENANCE_PLAN_NOT_FOUND", 404, "Maintenance plan not found");
  }
  return { data: plan };
}

export async function createPlan(actor: AuthUser, input: CreatePlanInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, organizationId: actor.organizationId } });
  if (!asset) {
    throw new AppError("ASSET_NOT_FOUND", 404, "Asset not found");
  }
  const serviceType = await prisma.serviceType.findFirst({ where: { id: input.serviceTypeId, organizationId: actor.organizationId } });
  if (!serviceType) {
    throw new AppError("SERVICE_TYPE_NOT_FOUND", 404, "Service type not found");
  }
  if (!serviceType.isActive) {
    throw new AppError("SERVICE_TYPE_INACTIVE", 400, "Choose an active service type");
  }
  if (input.contractId) {
    const covered = await prisma.contractAsset.findFirst({
      where: { contractId: input.contractId, assetId: asset.id, contract: { organizationId: actor.organizationId } },
    });
    if (!covered) {
      throw new AppError("VALIDATION_ERROR", 400, "The contract must cover this asset", { field: "contractId" });
    }
  }
  const plan = await prisma.maintenancePlan.create({
    data: {
      organizationId: actor.organizationId,
      customerId: asset.customerId,
      assetId: asset.id,
      serviceTypeId: serviceType.id,
      contractId: input.contractId,
      name: input.name,
      intervalDays: input.intervalDays,
      leadDays: input.leadDays,
      nextDueOn: day(input.firstDueOn),
    },
    include,
  });
  return { data: plan };
}

export async function updatePlan(id: string, actor: AuthUser, input: UpdatePlanInput) {
  const { data: plan } = await getPlan(id, actor);
  const { nextDueOn, ...rest } = input;
  await prisma.maintenancePlan.update({
    where: { id: plan.id },
    data: { ...rest, ...(nextDueOn ? { nextDueOn: day(nextDueOn) } : {}) },
  });
  return getPlan(plan.id, actor);
}

export async function movePlan(id: string, actor: AuthUser, action: PlanAction) {
  const { data: plan } = await getPlan(id, actor);
  const { from, to } = planTransitions[action];
  const moved = await prisma.maintenancePlan.updateMany({ where: { id: plan.id, isActive: from }, data: { isActive: to } });
  if (moved.count !== 1) {
    throw new AppError("INVALID_TRANSITION", 409, action === "pause" ? "This plan is already paused" : "This plan is already active");
  }
  return getPlan(plan.id, actor);
}

// Opens the request and work order for one due plan. The plan row is locked so two sweeps
// (or the timer and a manual run) cannot both generate it.
async function generateFor(planId: string, now: Date) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT "id" FROM "MaintenancePlan" WHERE "id" = ${planId} FOR UPDATE`;
    const plan = await tx.maintenancePlan.findUniqueOrThrow({
      where: { id: planId },
      include: { asset: true, contract: true, serviceType: true },
    });
    if (!isDue(plan, now) || !plan.serviceType.isActive) {
      return null;
    }
    const open = await tx.workOrder.count({ where: { maintenancePlanId: plan.id, status: { in: [...openWorkOrderStatuses] } } });
    if (open > 0) {
      return null;
    }
    // A contract plan stops with its contract.
    if (plan.contract && (plan.contract.status !== "ACTIVE" || plan.contract.endsOn.getTime() < plan.nextDueOn.getTime())) {
      return null;
    }
    const description = `Preventive maintenance: ${plan.name}`;
    const request = await tx.serviceRequest.create({
      data: {
        organizationId: plan.organizationId,
        customerId: plan.customerId,
        assetId: plan.assetId,
        addressId: plan.asset.addressId,
        serviceTypeId: plan.serviceTypeId,
        description,
        preferredStart: plan.nextDueOn,
        preferredEnd: new Date(plan.nextDueOn.getTime() + Math.max(plan.leadDays, 7) * DAY_MS),
        priority: "NORMAL",
        status: "ACCEPTED",
      },
    });
    const workOrder = await createOpenWorkOrder(tx, {
      organizationId: plan.organizationId,
      requestId: request.id,
      customerId: plan.customerId,
      assetId: plan.assetId,
      addressId: plan.asset.addressId,
      serviceTypeId: plan.serviceTypeId,
      priority: "NORMAL",
      description,
      maintenancePlanId: plan.id,
    });
    await tx.maintenancePlan.update({ where: { id: plan.id }, data: { lastGeneratedAt: now } });
    return { requestId: request.id, workOrderId: workOrder.id };
  });
}

export async function generateDue(now = new Date(), organizationId?: string) {
  const candidates = await prisma.maintenancePlan.findMany({
    where: { ...(organizationId ? { organizationId } : {}), isActive: true },
    select: { id: true, isActive: true, nextDueOn: true, leadDays: true },
  });
  const generated = [];
  for (const plan of candidates.filter((row) => isDue(row, now))) {
    const result = await generateFor(plan.id, now);
    if (result) {
      generated.push(result);
      await notify(() => requestEvent("request.accepted", result.requestId));
      await notify(() => requestEvent("request.new", result.requestId));
    }
  }
  return generated;
}

// Inside the completion transaction, after the draft invoice is priced: a job the contract paid
// for uses one included visit, and a maintenance job moves its plan to the next occurrence.
export async function onWorkOrderCompleted(tx: Prisma.TransactionClient, workOrderId: string, completedAt: Date) {
  const workOrder = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { invoice: { select: { coverageSource: true, contractId: true } }, maintenancePlan: true },
  });
  const contractId = workOrder.invoice?.coverageSource === "CONTRACT" ? workOrder.invoice.contractId : null;
  if (contractId) {
    const counted = await tx.contractVisit.createMany({
      data: [{ organizationId: workOrder.organizationId, contractId, workOrderId }],
      skipDuplicates: true,
    });
    if (counted.count === 1) {
      await tx.serviceContract.update({ where: { id: contractId }, data: { usedVisits: { increment: 1 } } });
    }
  }
  if (workOrder.maintenancePlan) {
    await tx.maintenancePlan.update({
      where: { id: workOrder.maintenancePlan.id },
      data: { nextDueOn: nextDueAfter(completedAt, workOrder.maintenancePlan.intervalDays) },
    });
  }
}
