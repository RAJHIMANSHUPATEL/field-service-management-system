import { prisma } from "../lib/prisma.js";

export async function resetDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.visitChange.deleteMany();
  await prisma.visitPhoto.deleteMany();
  await prisma.technicianTimeOff.deleteMany();
  await prisma.workOrderNote.deleteMany();
  await prisma.serviceVisit.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.serviceRequestAttachment.deleteMany();
  await prisma.serviceRequestNote.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.part.deleteMany();
  await prisma.technicianSkill.deleteMany();
  await prisma.technicianServiceArea.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.serviceArea.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
