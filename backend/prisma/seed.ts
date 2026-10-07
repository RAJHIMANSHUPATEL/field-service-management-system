import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/lib/prisma.js";

const organizationName = "Field Service Co";
const password = "Password123!";

const users = [
  { email: "admin@fieldservice.local", name: "Asha Admin", role: "ADMIN" },
  { email: "ops@fieldservice.local", name: "Omar Ops", role: "OPS" },
  { email: "technician@fieldservice.local", name: "Tara Technician", role: "TECHNICIAN" },
  { email: "customer@fieldservice.local", name: "Cara Customer", role: "CUSTOMER" },
] as const;

async function main() {
  const existingOrganization = await prisma.organization.findFirst({
    where: { name: organizationName },
  });
  const organization =
    existingOrganization ??
    (await prisma.organization.create({
      data: { name: organizationName },
    }));

  const passwordHash = await argon2.hash(password);

  for (const user of users) {
    const existingUser = await prisma.user.findFirst({
      where: { organizationId: organization.id, email: user.email },
    });

    if (!existingUser) {
      await prisma.user.create({
        data: {
          organizationId: organization.id,
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
        },
      });
    }
  }

  const customerUser = await prisma.user.findFirstOrThrow({
    where: { organizationId: organization.id, email: "customer@fieldservice.local" },
  });
  const technicianUser = await prisma.user.findFirstOrThrow({
    where: { organizationId: organization.id, email: "technician@fieldservice.local" },
  });

  const existingCustomer = await prisma.customer.findFirst({
    where: { organizationId: organization.id, name: "ABC Apartments" },
  });
  const customer =
    existingCustomer ??
    (await prisma.customer.create({
      data: {
        organizationId: organization.id,
        name: "ABC Apartments",
        phone: "555-0100",
        email: "office@abcapartments.example",
      },
    }));

  const existingContact = await prisma.customerContact.findFirst({
    where: { customerId: customer.id, userId: customerUser.id },
  });
  if (!existingContact) {
    await prisma.customerContact.create({
      data: {
        customerId: customer.id,
        name: customerUser.name,
        email: customerUser.email,
        phone: "555-0101",
        userId: customerUser.id,
      },
    });
  }

  const existingAddress = await prisma.address.findFirst({
    where: { customerId: customer.id, label: "Main building" },
  });
  const address =
    existingAddress ??
    (await prisma.address.create({
      data: {
        customerId: customer.id,
        label: "Main building",
        line1: "100 Market Street",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        isPrimary: true,
      },
    }));

  const serialNumber = "AC-1001";
  const existingAsset = await prisma.asset.findFirst({
    where: { organizationId: organization.id, serialNumber },
  });
  if (!existingAsset) {
    await prisma.asset.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        addressId: address.id,
        equipmentType: "Air conditioner",
        model: "CoolAir 2400",
        serialNumber,
        installedAt: new Date("2024-06-01T00:00:00.000Z"),
        warrantyExpiresAt: new Date("2027-06-01T00:00:00.000Z"),
      },
    });
  }

  const existingServiceType = await prisma.serviceType.findFirst({
    where: { organizationId: organization.id, name: "Repair" },
  });
  if (!existingServiceType) {
    await prisma.serviceType.create({
      data: {
        organizationId: organization.id,
        name: "Repair",
        description: "Diagnose and repair installed equipment",
        serviceCharge: "500.00",
        labourRatePerHour: "1000.00",
        sacCode: "998719",
      },
    });
  } else if (existingServiceType.serviceCharge.eq(0) && existingServiceType.labourRatePerHour.eq(0)) {
    // Databases seeded before pricing existed get the same demo prices.
    await prisma.serviceType.update({
      where: { id: existingServiceType.id },
      data: { serviceCharge: "500.00", labourRatePerHour: "1000.00", sacCode: "998719" },
    });
  }

  const existingTechnician = await prisma.technician.findUnique({
    where: { userId: technicianUser.id },
  });
  if (!existingTechnician) {
    await prisma.technician.create({
      data: {
        organizationId: organization.id,
        userId: technicianUser.id,
        phone: "555-0199",
      },
    });
  }

  const seededAsset = await prisma.asset.findFirst({
    where: { organizationId: organization.id, serialNumber },
  });
  const seededServiceType = await prisma.serviceType.findFirst({
    where: { organizationId: organization.id, name: "Repair" },
  });
  const existingRequest = await prisma.serviceRequest.findFirst({
    where: { organizationId: organization.id, description: "The air conditioner is not cooling." },
  });
  if (!existingRequest && seededAsset && seededServiceType) {
    await prisma.serviceRequest.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        contactId: (
          await prisma.customerContact.findFirst({
            where: { customerId: customer.id, userId: customerUser.id },
          })
        )?.id,
        assetId: seededAsset.id,
        addressId: seededAsset.addressId,
        serviceTypeId: seededServiceType.id,
        description: "The air conditioner is not cooling.",
        preferredStart: new Date("2026-10-06T00:00:00.000Z"),
        preferredEnd: new Date("2026-10-08T00:00:00.000Z"),
        priority: "NORMAL",
        status: "SUBMITTED",
      },
    });
  }

  const technicianRecord = await prisma.technician.findUnique({ where: { userId: technicianUser.id } });
  for (const name of ["Air conditioning", "Refrigerant handling", "Electrical"]) {
    await prisma.skill.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: {},
      create: { organizationId: organization.id, name },
    });
  }
  const area = await prisma.serviceArea.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Austin central" } },
    update: {},
    create: { organizationId: organization.id, name: "Austin central", postalCodes: ["78701", "78702", "78703"] },
  });
  for (const part of [
    { sku: "CAP-35", name: "Run capacitor 35uF", unitPrice: "1250.00" },
    { sku: "GAS-R32", name: "R32 refrigerant (1 kg)", unitPrice: "2400.00" },
    { sku: "FLT-STD", name: "Air filter", unitPrice: "450.00" },
  ]) {
    await prisma.part.upsert({
      where: { organizationId_sku: { organizationId: organization.id, sku: part.sku } },
      update: {},
      create: { organizationId: organization.id, currency: "INR", ...part },
    });
  }
  await prisma.warehouse.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Main store" } },
    update: {},
    create: { organizationId: organization.id, name: "Main store", kind: "WAREHOUSE" },
  });
  if (technicianRecord) {
    await prisma.warehouse.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "Tara's van" } },
      update: {},
      create: { organizationId: organization.id, name: "Tara's van", kind: "VAN", technicianId: technicianRecord.id },
    });
    const skill = await prisma.skill.findFirst({ where: { organizationId: organization.id, name: "Air conditioning" } });
    if (skill) {
      await prisma.technicianSkill.upsert({
        where: { technicianId_skillId: { technicianId: technicianRecord.id, skillId: skill.id } },
        update: {},
        create: { technicianId: technicianRecord.id, skillId: skill.id },
      });
    }
    await prisma.technicianServiceArea.upsert({
      where: { technicianId_serviceAreaId: { technicianId: technicianRecord.id, serviceAreaId: area.id } },
      update: {},
      create: { technicianId: technicianRecord.id, serviceAreaId: area.id },
    });
  }

  console.log(`Seeded ${organization.name}`);
  console.log(`Password for every seeded user: ${password}`);
  for (const user of users) {
    console.log(`${user.role} ${user.email}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
