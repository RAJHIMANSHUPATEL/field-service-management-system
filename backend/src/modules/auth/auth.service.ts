import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Role } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/authUser.js";
import { appUrl, sendMail } from "../../lib/mailer.js";
import { openToken, sealToken } from "./sealedToken.js";
import type {
  AcceptInvitationInput,
  ConfirmPasswordResetInput,
  LoginInput,
  RegisterOrganizationInput,
} from "./auth.schema.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// How long a just-rotated refresh token may be presented again and get the same successor back,
// for a refresh whose response was lost (page reloaded mid-request). Outside it, any presentation
// of a rotated token is reuse and revokes the family. 0 turns the window off.
export const REFRESH_GRACE_WINDOW_MS = graceWindowFromEnv(process.env.REFRESH_GRACE_WINDOW_MS);

function graceWindowFromEnv(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 10_000;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 60_000) {
    throw new Error("REFRESH_GRACE_WINDOW_MS must be a whole number of milliseconds from 0 to 60000");
  }
  return value;
}

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

// For scripts acting as an existing user (the demo seed replays months of activity under a
// simulated clock): the same access token a login would issue, without a password round trip.
export async function accessTokenFor(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { organization: true } });
  return signAccessToken(toSessionUser(user));
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

// Thrown inside the rotation transaction when another request rotated the same token first.
class RotationRaceLost extends Error {}

export async function refresh(refreshToken: string): Promise<AuthSession> {
  const tokenHash = hashToken(refreshToken);
  // Two passes at most: a request that loses a concurrent rotation re-reads the token and is then
  // answered from the grace window like any other retry.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { organization: true } } },
    });
    if (!existing) {
      throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
    }

    if (existing.revokedAt) {
      const replay = await graceReplay(existing);
      if (replay) {
        return replay;
      }
      await revokeFamily(existing.familyId);
      throw new AppError("REFRESH_TOKEN_REUSED", 401, "Refresh token has already been used");
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
    }

    try {
      return await rotate(existing);
    } catch (error) {
      if (!(error instanceof RotationRaceLost)) {
        throw error;
      }
    }
  }
  throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
}

type StoredRefreshToken = {
  id: string;
  userId: string;
  familyId: string;
  graceUntil: Date | null;
  successorId: string | null;
  successorSecret: string | null;
  user: Parameters<typeof toSessionUser>[0];
};

async function rotate(existing: StoredRefreshToken): Promise<AuthSession> {
  const now = new Date();
  const nextRefreshToken = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    const successor = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(nextRefreshToken),
        familyId: existing.familyId,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });
    // Conditional on the token still being live: a concurrent rotation blocks on the row lock,
    // then matches nothing and rolls back its own successor.
    const rotated = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: {
        revokedAt: now,
        ...(REFRESH_GRACE_WINDOW_MS > 0
          ? {
              graceUntil: new Date(now.getTime() + REFRESH_GRACE_WINDOW_MS),
              successorId: successor.id,
              successorSecret: sealToken(nextRefreshToken, existing.id),
            }
          : {}),
      },
    });
    if (rotated.count !== 1) {
      throw new RotationRaceLost();
    }
    // Earlier rotations in this family are past their window by now: drop their sealed tokens.
    await tx.refreshToken.updateMany({
      where: { familyId: existing.familyId, id: { not: existing.id }, graceUntil: { lte: now } },
      data: { graceUntil: null, successorId: null, successorSecret: null },
    });
  });

  const sessionUser = toSessionUser(existing.user);
  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: nextRefreshToken,
    user: sessionUser,
  };
}

// A rotated token presented again inside its window gets the successor it was rotated into, with
// a fresh access token for the same user (access tokens are not stored). Only while that successor
// is still live: if it has been rotated in turn, logged out, revoked with its family or by a
// password reset, or has expired, this returns null and the caller treats the request as reuse.
async function graceReplay(existing: StoredRefreshToken): Promise<AuthSession | null> {
  if (!existing.graceUntil || !existing.successorId || !existing.successorSecret) {
    return null;
  }
  if (existing.graceUntil.getTime() <= Date.now()) {
    return null;
  }
  const successor = await prisma.refreshToken.findUnique({ where: { id: existing.successorId } });
  if (
    !successor ||
    successor.revokedAt ||
    successor.familyId !== existing.familyId ||
    successor.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  const successorToken = openToken(existing.successorSecret, existing.id);
  if (!successorToken || hashToken(successorToken) !== successor.tokenHash) {
    return null;
  }
  const sessionUser = toSessionUser(existing.user);
  return {
    accessToken: signAccessToken(sessionUser),
    refreshToken: successorToken,
    user: sessionUser,
  };
}

async function revokeFamily(familyId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.refreshToken.updateMany({
      where: { familyId, successorSecret: { not: null } },
      data: { graceUntil: null, successorId: null, successorSecret: null },
    }),
  ]);
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
