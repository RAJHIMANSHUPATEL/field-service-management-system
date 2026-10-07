import argon2 from "argon2";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import type {
  CreateAddressInput,
  CreateContactInput,
  CreateCustomerInput,
  UpdateAddressInput,
  UpdateContactInput,
  UpdateCustomerInput,
} from "./customer.schema.js";

const customerInclude = {
  contacts: { orderBy: { createdAt: "asc" as const } },
  addresses: { orderBy: { createdAt: "asc" as const } },
  assets: { orderBy: { createdAt: "asc" as const } },
};

function toCustomer<T extends { contacts: Array<{ userId: string | null }> }>(customer: T) {
  return {
    ...customer,
    contacts: customer.contacts.map((contact) => ({
      ...contact,
      hasLogin: contact.userId !== null,
    })),
  };
}

async function requireCustomer(id: string, actor: AuthUser) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: customerInclude,
  });
  if (!customer) {
    throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
  }
  if (actor.role === "CUSTOMER") {
    const owns = customer.contacts.some((contact) => contact.userId === actor.id);
    if (!owns) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
    }
  }
  return customer;
}

export async function listCustomers(actor: AuthUser, pageQuery: PageQuery) {
  const where =
    actor.role === "CUSTOMER"
      ? {
          organizationId: actor.organizationId,
          contacts: { some: { userId: actor.id } },
        }
      : { organizationId: actor.organizationId };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: customerInclude,
      orderBy: { name: "asc" },
      skip: (pageQuery.page - 1) * pageQuery.limit,
      take: pageQuery.limit,
    }),
  ]);

  return {
    data: customers.map(toCustomer),
    meta: pageMeta(total, pageQuery.page, pageQuery.limit),
  };
}

export async function getCustomer(id: string, actor: AuthUser) {
  return { data: toCustomer(await requireCustomer(id, actor)) };
}

export async function createCustomer(input: CreateCustomerInput, actor: AuthUser) {
  const customer = await prisma.customer.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email?.toLowerCase(),
    },
    include: customerInclude,
  });
  return { data: toCustomer(customer) };
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, actor: AuthUser) {
  await requireCustomer(id, actor);
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email?.toLowerCase() ?? null } : {}),
    },
    include: customerInclude,
  });
  return { data: toCustomer(customer) };
}

async function emailTaken(organizationId: string, email: string, exceptUserId?: string) {
  const existing = await prisma.user.findFirst({
    where: {
      organizationId,
      email,
      ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}),
    },
  });
  if (existing) {
    throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
  }
}

export async function createContact(customerId: string, input: CreateContactInput, actor: AuthUser) {
  await requireCustomer(customerId, actor);
  const email = input.email.toLowerCase();

  const contact = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (input.password) {
      const existing = await tx.user.findFirst({
        where: { organizationId: actor.organizationId, email },
      });
      if (existing) {
        throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
      }
      const user = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          email,
          name: input.name,
          role: "CUSTOMER",
          passwordHash: await argon2.hash(input.password),
        },
      });
      userId = user.id;
    }

    return tx.customerContact.create({
      data: {
        customerId,
        name: input.name,
        email,
        phone: input.phone,
        userId,
      },
    });
  });

  return { data: { ...contact, hasLogin: contact.userId !== null } };
}

export async function updateContact(
  customerId: string,
  contactId: string,
  input: UpdateContactInput,
  actor: AuthUser,
) {
  await requireCustomer(customerId, actor);
  const contact = await prisma.customerContact.findFirst({
    where: { id: contactId, customerId },
  });
  if (!contact) {
    throw new AppError("CONTACT_NOT_FOUND", 404, "Contact not found");
  }

  const email = input.email?.toLowerCase();
  if (email && email !== contact.email) {
    await emailTaken(actor.organizationId, email, contact.userId ?? undefined);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (contact.userId && (email || input.name)) {
      await tx.user.update({
        where: { id: contact.userId },
        data: {
          ...(email ? { email } : {}),
          ...(input.name ? { name: input.name } : {}),
        },
      });
    }
    return tx.customerContact.update({
      where: { id: contactId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
  });

  return { data: { ...updated, hasLogin: updated.userId !== null } };
}

export async function createAddress(customerId: string, input: CreateAddressInput, actor: AuthUser) {
  await requireCustomer(customerId, actor);
  const addressCount = await prisma.address.count({ where: { customerId } });
  const isPrimary = input.isPrimary ?? addressCount === 0;

  const address = await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.address.updateMany({ where: { customerId }, data: { isPrimary: false } });
    }
    return tx.address.create({
      data: {
        customerId,
        label: input.label,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        isPrimary,
      },
    });
  });

  return { data: address };
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: UpdateAddressInput,
  actor: AuthUser,
) {
  await requireCustomer(customerId, actor);
  const address = await prisma.address.findFirst({ where: { id: addressId, customerId } });
  if (!address) {
    throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.address.updateMany({ where: { customerId }, data: { isPrimary: false } });
    }
    return tx.address.update({
      where: { id: addressId },
      data: input,
    });
  });

  return { data: updated };
}
