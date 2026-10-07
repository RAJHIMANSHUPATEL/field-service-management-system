import type { NextFunction, Request, Response } from "express";
import type { Role } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import * as authService from "../modules/auth/auth.service.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("UNAUTHENTICATED", 401, "Authentication is required");
    }

    const accessToken = header.slice("Bearer ".length).trim();
    req.user = await authService.authenticate(accessToken);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  const check = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("FORBIDDEN", 403, "You do not have access to this resource"));
      return;
    }

    next();
  };
  // Read by the OpenAPI generator to document who may call each route.
  return Object.assign(check, { roles });
}
