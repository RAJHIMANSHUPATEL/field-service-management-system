import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Role } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/authUser.js";
import type { LoginInput } from "./auth.schema.js";

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

function hashToken(token: string): string {
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

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) {
    return;
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!existing || existing.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
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
