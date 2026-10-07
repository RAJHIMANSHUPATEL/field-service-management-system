import { randomBytes } from "node:crypto";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { appUrl, sendMail } from "../../lib/mailer.js";
import { pageMeta, type PageQuery } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../auth/auth.service.js";
import { canMoveInvitation } from "./invitation.transitions.js";
import type { CreateInvitationInput } from "./user.schema.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const invitationSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
};

export async function listUsers(actor: AuthUser, query: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { data: users, meta: pageMeta(total, query.page, query.limit) };
}

export async function listInvitations(actor: AuthUser, query: PageQuery) {
  const where = { organizationId: actor.organizationId };
  const [total, invitations] = await Promise.all([
    prisma.invitation.count({ where }),
    prisma.invitation.findMany({
      where,
      select: invitationSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { data: invitations, meta: pageMeta(total, query.page, query.limit) };
}

export async function createInvitation(actor: AuthUser, input: CreateInvitationInput) {
  const email = input.email.toLowerCase();
  const taken = await prisma.user.findFirst({ where: { organizationId: actor.organizationId, email } });
  if (taken) {
    throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
  }
  const open = await prisma.invitation.findFirst({
    where: { organizationId: actor.organizationId, email, status: "PENDING" },
  });
  if (open) {
    throw new AppError("INVITATION_PENDING", 409, "This email already has an open invitation");
  }
  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: actor.organizationId,
      invitedById: actor.id,
      email,
      name: input.name,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
    select: invitationSelect,
  });
  const link = appUrl(`/accept-invite?token=${token}`);
  await sendMail({ to: email, subject: "You are invited to FieldOps", text: `Set your password: ${link}`, link });
  return { data: invitation };
}

export async function revokeInvitation(id: string, actor: AuthUser) {
  const invitation = await prisma.invitation.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!invitation) {
    throw new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found");
  }
  if (!canMoveInvitation(invitation.status, "REVOKED")) {
    throw new AppError("INVALID_TRANSITION", 409, "This invitation is no longer open");
  }
  const updated = await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
    select: invitationSelect,
  });
  return { data: updated };
}
