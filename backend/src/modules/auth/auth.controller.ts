import type { CookieOptions, Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { loginSchema, refreshSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";

export const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function refreshCookieOptions(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return undefined;
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const session = await authService.login(body);
  setRefreshCookie(res, session.refreshToken);
  res.status(200).json({
    data: {
      accessToken: session.accessToken,
      user: session.user,
    },
  });
}

export async function refresh(req: Request, res: Response) {
  const body = refreshSchema.parse(req.body ?? {});
  const refreshToken = body.refreshToken ?? readCookie(req.header("cookie"), REFRESH_COOKIE);
  if (!refreshToken) {
    throw new AppError("REFRESH_TOKEN_INVALID", 401, "Refresh token is invalid");
  }

  const session = await authService.refresh(refreshToken);
  setRefreshCookie(res, session.refreshToken);
  res.status(200).json({
    data: {
      accessToken: session.accessToken,
      user: session.user,
    },
  });
}

export async function logout(req: Request, res: Response) {
  const refreshToken = readCookie(req.header("cookie"), REFRESH_COOKIE);
  await authService.logout(refreshToken);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  const user = await authService.currentUser(req.user.id);
  res.status(200).json({ data: user });
}
