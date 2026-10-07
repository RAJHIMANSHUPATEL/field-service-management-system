import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Role } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/authUser.js";
import { appUrl, sendMail } from "../../lib/mailer.js";
import type {
  AcceptInvitationInput,
  ConfirmPasswordResetInput,
  LoginInput,
  RegisterOrganizationInput,
} from "./auth.schema.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organization: { id: string; name: string };
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  organization: { id: string; name: string };
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
    },
  };
}

function signAccessToken(user: SessionUser): string {
  return jwt.sign(
    {
      sub: user.id,
      organizationId: user.organization.id,
      role: user.role,
    },
    requiredEnv("JWT_ACCESS_SECRET"),
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

async function issueRefreshToken(userId: string, familyId: string): Promise<string> {
  const refreshToken = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return refreshToken;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const email = input.email.toLowerCase();
  const users = await prisma.user.findMany({
    where: { email },
    include: { organization: true },
  });
  
  const user = users.length === 1 ? users[0] : undefined;

  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect");
  }

  const passwordMatches = await argon2.verify(user.passwordHash, input.password);
  if (!passwordMatches) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Email or password is incorrect");
  }

  const sessionUser = toSessionUser(user);
  const refreshToken = await issueRefreshToken(user.id, randomUUID());

  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken,
    user: sessionUser,
  };
}

export async function refresh(refreshToken: string): Promise<AuthSession> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { include: { organization: true } } },
  });
  if (!existing) {
    throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError("REFRESH_TOKEN_REUSED", 401, "Refresh token has already been used");
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  const sessionUser = toSessionUser(existing.user);
  const nextRefreshToken = await issueRefreshToken(existing.userId, existing.familyId);

  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: nextRefreshToken,
    user: sessionUser,
  };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) {
    return null;
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { select: { id: true, organizationId: true } } },
  });
  if (!existing || existing.revokedAt) {
    return null;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return existing.user;
}

export async function authenticate(accessToken: string): Promise<AuthUser> {
  let payload: unknown;
  try {
    payload = jwt.verify(accessToken, requiredEnv("JWT_ACCESS_SECRET"));
  } catch {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  if (!payload || typeof payload !== "object" || !("sub" in payload) || typeof payload.sub !== "string") {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  return {
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

export async function currentUser(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user) {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  return toSessionUser(user);
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.toLowerCase();
  const users = await prisma.user.findMany({ where: { email } });
  const user = users.length === 1 ? users[0] : undefined;
  // Same response whether or not the account exists, so the endpoint does not reveal accounts.
  if (!user) {
    return null;
  }
  const token = newToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  const link = appUrl(`/reset-password?token=${token}`);
  await sendMail({ to: user.email, subject: "Reset your password", text: `Reset your password: ${link}`, link });
  return { id: user.id, organizationId: user.organizationId };
}

export async function confirmPasswordReset(input: ConfirmPasswordResetInput) {
  const existing = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: true },
  });
  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError("TOKEN_INVALID", 400, "This link is invalid or has expired");
  }
  if (existing.usedAt) {
    throw new AppError("INVALID_TRANSITION", 409, "This link has already been used");
  }
  const passwordHash = await argon2.hash(input.password);
  await prisma.$transaction(async (tx) => {
    const used = await tx.passwordResetToken.updateMany({
      where: { id: existing.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This link has already been used");
    }
    await tx.user.update({ where: { id: existing.userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  return { id: existing.user.id, organizationId: existing.user.organizationId };
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<AuthSession> {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!invitation || invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError("TOKEN_INVALID", 400, "This invitation is invalid or has expired");
  }
  if (invitation.status !== "PENDING") {
    throw new AppError("INVALID_TRANSITION", 409, "This invitation is no longer open");
  }
  const taken = await prisma.user.findFirst({
    where: { organizationId: invitation.organizationId, email: invitation.email },
  });
  if (taken) {
    throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
  }
  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.invitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new AppError("INVALID_TRANSITION", 409, "This invitation is no longer open");
    }
    return tx.user.create({
      data: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        passwordHash,
      },
      include: { organization: true },
    });
  });
  const sessionUser = toSessionUser(user);
  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: await issueRefreshToken(user.id, randomUUID()),
    user: sessionUser,
  };
}

// Starts a new tenant: one organization and its first admin. Emails are unique across
// organizations because sign-in looks a user up by email alone.
export async function registerOrganization(input: RegisterOrganizationInput): Promise<AuthSession> {
  const email = input.email.toLowerCase();
  if (await prisma.user.findFirst({ where: { email } })) {
    throw new AppError("EMAIL_IN_USE", 409, "A user with this email already exists");
  }
  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.organizationName } });
    return tx.user.create({
      data: { organizationId: organization.id, email, name: input.name, role: "ADMIN", passwordHash },
      include: { organization: true },
    });
  });
  const sessionUser = toSessionUser(user);
  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: await issueRefreshToken(user.id, randomUUID()),
    user: sessionUser,
  };
}
