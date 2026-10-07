import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import * as authService from "../modules/auth/auth.service.js";

const TTL_MS = 24 * 60 * 60 * 1000;

async function scopeFor(req: Request) {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      const user = await authService.authenticate(header.slice(7).trim());
      return `user:${user.id}`;
    } catch {
      // An invalid token is answered by the route itself with 401; scope by address meanwhile.
    }
  }
  return `ip:${req.ip}`;
}

// A POST carrying `Idempotency-Key` runs once: a retry with the same key and body gets the
// stored response (header `Idempotent-Replayed: true`) instead of repeating the state change.
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header("idempotency-key");
  if (req.method !== "POST" || !key) {
    next();
    return;
  }
  try {
    if (key.length > 200) {
      throw new AppError("VALIDATION_ERROR", 400, "Idempotency-Key must be at most 200 characters");
    }
    const scope = await scopeFor(req);
    const requestHash = createHash("sha256")
      .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
      .digest("hex");
    await prisma.idempotencyKey.deleteMany({ where: { scope, key, expiresAt: { lt: new Date() } } });
    try {
      await prisma.idempotencyKey.create({
        data: { scope, key, method: req.method, path: req.originalUrl, requestHash, expiresAt: new Date(Date.now() + TTL_MS) },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const existing = await prisma.idempotencyKey.findUniqueOrThrow({ where: { scope_key: { scope, key } } });
      if (existing.requestHash !== requestHash) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 422, "This Idempotency-Key was used for a different request");
      }
      if (existing.statusCode === null) {
        throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409, "The original request is still being processed");
      }
      res.setHeader("Idempotent-Replayed", "true");
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }

    let body: unknown = null;
    const json = res.json.bind(res);
    res.json = (payload: unknown) => {
      body = payload;
      return json(payload);
    };
    res.on("finish", () => {
      // Server errors are not stored, so the client may retry them with the same key.
      const write =
        res.statusCode >= 500
          ? prisma.idempotencyKey.delete({ where: { scope_key: { scope, key } } })
          : prisma.idempotencyKey.update({
              where: { scope_key: { scope, key } },
              data: { statusCode: res.statusCode, responseBody: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue },
            });
      write.catch((error: unknown) => console.error("[idempotency] could not record the response", error));
    });
    next();
  } catch (error) {
    next(error);
  }
}
