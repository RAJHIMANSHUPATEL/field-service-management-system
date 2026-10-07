import { prisma } from "../lib/prisma.js";

export async function resetDatabase() {
  await prisma.workOrderNote.deleteMany();
  await prisma.serviceVisit.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.serviceRequestNote.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
