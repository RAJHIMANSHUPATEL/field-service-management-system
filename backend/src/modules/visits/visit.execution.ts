import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../types/authUser.js";
import type { VisitStatus } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { downloadUrl, putObject } from "../../lib/storage.js";
import { getWorkOrder } from "../workOrders/workOrder.service.js";
import { reportableStatuses, signableStatuses } from "./visit.transitions.js";
import type { SignatureInput, VisitReportInput } from "./visit.schema.js";

// Work done on site: only the technician on the visit records it, and only while on site.
async function requireOwnVisit(id: string, actor: AuthUser, allowed: VisitStatus[], what: string) {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { technician: { select: { userId: true } } },
  });
  if (!visit) {
    throw new AppError("VISIT_NOT_FOUND", 404, "Visit not found");
  }
  if (actor.role !== "TECHNICIAN" || visit.technician.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  if (!allowed.includes(visit.status)) {
    throw new AppError("INVALID_TRANSITION", 409, `${what} is not possible at this step of the visit`);
  }
  return visit;
}

export async function saveReport(id: string, actor: AuthUser, input: VisitReportInput) {
  const visit = await requireOwnVisit(id, actor, reportableStatuses, "Recording the report");
  await prisma.serviceVisit.update({ where: { id: visit.id }, data: input });
  return getWorkOrder(visit.workOrderId, actor);
}

export async function addPhoto(
  id: string,
  actor: AuthUser,
  file: { body: Buffer; contentType: string; fileName: string; caption?: string },
) {
  const visit = await requireOwnVisit(id, actor, reportableStatuses, "Adding a photo");
  if (file.body.length === 0) {
    throw new AppError("VALIDATION_ERROR", 400, "The file is empty");
  }
  const storageKey = `${actor.organizationId}/visits/${visit.id}/${randomUUID()}`;
  await putObject(storageKey, file.body, file.contentType);
  const photo = await prisma.visitPhoto.create({
    data: {
      organizationId: actor.organizationId,
      visitId: visit.id,
      uploadedById: actor.id,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.body.length,
      storageKey,
      caption: file.caption,
    },
    select: { id: true, fileName: true, contentType: true, caption: true, createdAt: true },
  });
  return { data: photo };
}

export async function sign(id: string, actor: AuthUser, input: SignatureInput) {
  const visit = await requireOwnVisit(id, actor, signableStatuses, "Signing");
  const storageKey = `${actor.organizationId}/visits/${visit.id}/signature-${randomUUID()}.png`;
  await putObject(storageKey, input.image, "image/png");
  await prisma.serviceVisit.update({
    where: { id: visit.id },
    data: { signerName: input.signerName, signatureKey: storageKey, signedAt: new Date() },
  });
  return getWorkOrder(visit.workOrderId, actor);
}

// Staff in the org, the visit's technician, and the job's customer may view photos and the signature.
async function requireReadableVisit(id: string, actor: AuthUser) {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      technician: { select: { userId: true } },
      workOrder: { select: { customerId: true } },
    },
  });
  if (!visit) {
    throw new AppError("VISIT_NOT_FOUND", 404, "Visit not found");
  }
  if (actor.role === "TECHNICIAN" && visit.technician.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  if (actor.role === "CUSTOMER") {
    const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
    if (!contact || contact.customerId !== visit.workOrder.customerId) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
    }
  }
  return visit;
}

export async function photoUrl(id: string, photoId: string, actor: AuthUser) {
  const visit = await requireReadableVisit(id, actor);
  const photo = await prisma.visitPhoto.findFirst({
    where: { id: photoId, visitId: visit.id, organizationId: actor.organizationId },
  });
  if (!photo) {
    throw new AppError("PHOTO_NOT_FOUND", 404, "Photo not found");
  }
  return { data: { url: await downloadUrl(photo.storageKey, photo.fileName) } };
}

export async function signatureUrl(id: string, actor: AuthUser) {
  const visit = await requireReadableVisit(id, actor);
  if (!visit.signatureKey) {
    throw new AppError("SIGNATURE_NOT_FOUND", 404, "This visit has no signature yet");
  }
  return { data: { url: await downloadUrl(visit.signatureKey, "signature.png") } };
}
