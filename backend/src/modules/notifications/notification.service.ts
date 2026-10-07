import type { NotificationAudience, NotificationStatus } from "../../generated/prisma/client.js";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { appUrl, sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { enqueueNotification, MAX_ATTEMPTS, registerNotificationHandler } from "../../lib/queue.js";
import { sendSms } from "../../lib/sms.js";
import { notificationCatalog, render, type NotificationEvent } from "./notification.catalog.js";

export type EmitInput = {
  organizationId: string;
  // Who the audience is, by role: the customer's contacts, the listed technicians, or the office.
  customerId?: string | null;
  technicianIds?: (string | null | undefined)[];
  vars?: Record<string, string | number | null | undefined>;
  link?: string;
  // Per-audience links, for example the request page for customers and the job page for staff.
  links?: Partial<Record<NotificationAudience, string>>;
  entityType?: string;
  entityId?: string;
  // Sweeps pass a key so an event fires once per subject (for example per contract).
  dedupeKey?: string;
};

export async function ensureRules(organizationId: string) {
  const existing = await prisma.notificationRule.findMany({ where: { organizationId }, select: { event: true } });
  const have = new Set(existing.map((row) => row.event));
  const missing = notificationCatalog.filter((entry) => !have.has(entry.event));
  if (missing.length > 0) {
    await prisma.notificationRule.createMany({
      data: missing.map((entry) => ({ organizationId, ...entry })),
      skipDuplicates: true,
    });
  }
}

async function recipients(audience: NotificationAudience, input: EmitInput) {
  if (audience === "CUSTOMER") {
    if (!input.customerId) {
      return [];
    }
    const contacts = await prisma.customerContact.findMany({
      where: { customerId: input.customerId, userId: { not: null } },
      select: { userId: true, phone: true, email: true },
    });
    return contacts.map((row) => ({ userId: row.userId!, phone: row.phone, email: row.email }));
  }
  if (audience === "TECHNICIAN") {
    const ids = (input.technicianIds ?? []).filter((id): id is string => Boolean(id));
    const technicians = await prisma.technician.findMany({
      where: { id: { in: ids }, organizationId: input.organizationId },
      select: { userId: true, phone: true, user: { select: { email: true } } },
    });
    return technicians.map((row) => ({ userId: row.userId, phone: row.phone, email: row.user.email }));
  }
  const staff = await prisma.user.findMany({
    where: { organizationId: input.organizationId, role: { in: ["ADMIN", "OPS"] } },
    select: { id: true, email: true },
  });
  return staff.map((row) => ({ userId: row.id, phone: null as string | null, email: row.email }));
}

// Records one delivery per recipient and channel from the org's rule, then queues them.
export async function emit(event: NotificationEvent, input: EmitInput) {
  await ensureRules(input.organizationId);
  const rule = await prisma.notificationRule.findUnique({
    where: { organizationId_event: { organizationId: input.organizationId, event } },
  });
  if (!rule || !rule.isEnabled) {
    return [];
  }
  const vars = input.vars ?? {};
  const subject = render(rule.subject, vars);
  const body = render(rule.body, vars);
  const ids: string[] = [];
  for (const recipient of await recipients(rule.audience, input)) {
    for (const channel of rule.channels) {
      // Text messages need a phone number; people without one get the other channels.
      if (channel === "SMS" && !recipient.phone) {
        continue;
      }
      const created = await prisma.notification.createManyAndReturn({
        data: [
          {
            organizationId: input.organizationId,
            event,
            audience: rule.audience,
            channel,
            recipientId: recipient.userId,
            subject,
            body,
            link: input.links?.[rule.audience] ?? input.link,
            entityType: input.entityType,
            entityId: input.entityId,
            dedupeKey: input.dedupeKey,
          },
        ],
        skipDuplicates: true,
        select: { id: true },
      });
      ids.push(...created.map((row) => row.id));
    }
  }
  for (const id of ids) {
    enqueueNotification(id);
  }
  return ids;
}

// The worker's job: send one delivery. Throws on failure so the queue retries; the last
// attempt marks it FAILED with the error, so nothing fails silently.
export async function deliver(id: string, attempt: number) {
  const notification = await prisma.notification.findUnique({
    where: { id },
    include: {
      recipient: {
        select: { email: true, customerContact: { select: { phone: true } }, technician: { select: { phone: true } } },
      },
    },
  });
  if (!notification || notification.status === "SENT") {
    return;
  }
  try {
    if (notification.channel === "EMAIL") {
      await sendMail({
        to: notification.recipient.email,
        subject: notification.subject,
        text: notification.body,
        link: notification.link ? appUrl(notification.link) : undefined,
      });
    } else if (notification.channel === "SMS") {
      const phone = notification.recipient.customerContact?.phone ?? notification.recipient.technician?.phone;
      if (!phone) {
        throw new Error("The recipient has no phone number");
      }
      await sendSms({ to: phone, text: `${notification.subject}: ${notification.body}` });
    }
    await prisma.notification.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), attempts: attempt, lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.notification.update({
      where: { id },
      data: { attempts: attempt, lastError: message, status: attempt >= MAX_ATTEMPTS ? "FAILED" : "PENDING" },
    });
    throw error;
  }
}

registerNotificationHandler(deliver);

const deliverySelect = {
  id: true,
  event: true,
  audience: true,
  channel: true,
  subject: true,
  body: true,
  link: true,
  status: true,
  attempts: true,
  lastError: true,
  sentAt: true,
  readAt: true,
  createdAt: true,
  entityType: true,
  entityId: true,
  recipient: { select: { id: true, name: true, role: true } },
};

export async function inbox(actor: AuthUser) {
  const rows = await prisma.notification.findMany({
    where: { organizationId: actor.organizationId, recipientId: actor.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: deliverySelect,
  });
  const unread = rows.filter((row) => !row.readAt).length;
  return { data: rows, meta: { unread } };
}

export async function markRead(id: string, actor: AuthUser) {
  const moved = await prisma.notification.updateMany({
    where: { id, organizationId: actor.organizationId, recipientId: actor.id, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
  if (moved.count !== 1) {
    const exists = await prisma.notification.count({ where: { id, organizationId: actor.organizationId, recipientId: actor.id } });
    throw exists
      ? new AppError("INVALID_TRANSITION", 409, "This notification is already read")
      : new AppError("NOTIFICATION_NOT_FOUND", 404, "Notification not found");
  }
  return { data: { id } };
}

export async function listDeliveries(actor: AuthUser, query: { event?: string; status?: NotificationStatus }) {
  const rows = await prisma.notification.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(query.event ? { event: query.event } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: deliverySelect,
  });
  return { data: rows };
}

export async function retry(id: string, actor: AuthUser) {
  const moved = await prisma.notification.updateMany({
    where: { id, organizationId: actor.organizationId, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null },
  });
  if (moved.count !== 1) {
    const exists = await prisma.notification.count({ where: { id, organizationId: actor.organizationId } });
    throw exists
      ? new AppError("INVALID_TRANSITION", 409, "Only a failed delivery can be retried")
      : new AppError("NOTIFICATION_NOT_FOUND", 404, "Notification not found");
  }
  enqueueNotification(id);
  return { data: { id } };
}

export async function listRules(actor: AuthUser) {
  await ensureRules(actor.organizationId);
  return {
    data: await prisma.notificationRule.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ audience: "asc" }, { event: "asc" }] }),
  };
}

export async function updateRule(
  id: string,
  actor: AuthUser,
  input: { isEnabled?: boolean; channels?: ("IN_APP" | "EMAIL" | "SMS")[]; subject?: string; body?: string },
) {
  const rule = await prisma.notificationRule.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!rule) {
    throw new AppError("NOTIFICATION_RULE_NOT_FOUND", 404, "Rule not found");
  }
  return { data: await prisma.notificationRule.update({ where: { id: rule.id }, data: input }) };
}
