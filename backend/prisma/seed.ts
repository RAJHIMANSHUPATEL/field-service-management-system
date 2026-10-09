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
  // GST state 29 (Karnataka): the seeded site is in Bengaluru, so its invoices are intra-state.
  const organization = existingOrganization
    ? await prisma.organization.update({ where: { id: existingOrganization.id }, data: { gstState: "29" } })
    : await prisma.organization.create({
        data: { name: organizationName, gstState: "29" },
      });

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
  const site = { line1: "100 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001" };
  const address = existingAddress
    ? await prisma.address.update({ where: { id: existingAddress.id }, data: site })
    : await prisma.address.create({
        data: { customerId: customer.id, label: "Main building", ...site, isPrimary: true },
      });

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
  // A second unit whose warranty has ended, so its jobs are billed in full.
  if (!(await prisma.asset.findFirst({ where: { organizationId: organization.id, serialNumber: "WH-2001" } }))) {
    await prisma.asset.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        addressId: address.id,
        equipmentType: "Water heater",
        model: "HeatPro 50",
        serialNumber: "WH-2001",
        installedAt: new Date("2021-03-01T00:00:00.000Z"),
        warrantyExpiresAt: new Date("2023-03-01T00:00:00.000Z"),
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
    where: { organizationId_name: { organizationId: organization.id, name: "Bengaluru central" } },
    update: {},
    create: { organizationId: organization.id, name: "Bengaluru central", postalCodes: ["560001", "560002", "560025"] },
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

  if (technicianRecord && seededServiceType) {
    await seedLayoutWeek(organization.id, technicianRecord.id, seededServiceType.id);
  }

  console.log(`Seeded ${organization.name}`);
  console.log(`Password for every seeded user: ${password}`);
  for (const user of users) {
    console.log(`${user.role} ${user.email}`);
  }
}

// The layout spec checks the schedule's week grid with real cards in it, so the current week
// (Monday to Sunday) always has visits for Tara, with long customer and equipment names. Idempotent:
// a day that already has a sample visit is left alone. ASSIGNED work orders never fire the late
// reminder sweep, and the slots sit outside the future slots other specs book.
const layoutCustomerName = "Sri Venkateshwara Co-operative Housing Society Residents' Welfare Association";
const layoutDescription = "Layout sample: weekly preventive check of the plant room";

async function seedLayoutWeek(organizationId: string, technicianId: string, serviceTypeId: string) {
  const customer =
    (await prisma.customer.findFirst({ where: { organizationId, name: layoutCustomerName } })) ??
    (await prisma.customer.create({
      data: { organizationId, name: layoutCustomerName, phone: "555-0150", email: "office@svchs.example.com" },
    }));
  const address =
    (await prisma.address.findFirst({ where: { customerId: customer.id, label: "Clubhouse" } })) ??
    (await prisma.address.create({
      data: {
        customerId: customer.id,
        label: "Clubhouse",
        line1: "12 Residency Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560025",
        isPrimary: true,
      },
    }));
  const asset =
    (await prisma.asset.findFirst({ where: { organizationId, serialNumber: "VRF-LAYOUT-01" } })) ??
    (await prisma.asset.create({
      data: {
        organizationId,
        customerId: customer.id,
        addressId: address.id,
        equipmentType: "Variable refrigerant flow air-conditioning system",
        model: "MultiZone 12",
        serialNumber: "VRF-LAYOUT-01",
        installedAt: new Date("2025-01-15T00:00:00.000Z"),
      },
    }));

  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(monday.getTime() + day * 86_400_000);
    // 06:30 and 09:30 UTC: the same calendar day in UTC (CI) and in India.
    for (const hour of [6.5, 9.5]) {
      const scheduledStart = new Date(date.getTime() + hour * 3_600_000);
      const existing = await prisma.serviceVisit.findFirst({
        where: { organizationId, technicianId, scheduledStart, workOrder: { description: layoutDescription } },
      });
      if (existing) continue;
      const request = await prisma.serviceRequest.create({
        data: {
          organizationId,
          customerId: customer.id,
          assetId: asset.id,
          addressId: address.id,
          serviceTypeId,
          description: layoutDescription,
          preferredStart: date,
          preferredEnd: date,
          status: "ACCEPTED",
        },
      });
      await prisma.workOrder.create({
        data: {
          organizationId,
          requestId: request.id,
          customerId: customer.id,
          assetId: asset.id,
          addressId: address.id,
          serviceTypeId,
          technicianId,
          priority: "NORMAL",
          description: layoutDescription,
          status: "ASSIGNED",
          visits: { create: { organizationId, technicianId, scheduledStart } },
        },
      });
    }
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
