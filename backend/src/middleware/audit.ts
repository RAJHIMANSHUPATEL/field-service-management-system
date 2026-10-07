import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const verbs: Record<string, string> = { POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };

export type AuditActor = { organizationId: string; actorId: string | null };

function describe(req: Request, body: unknown) {
  const segments = `${req.baseUrl}${req.route?.path ?? ""}`.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean);
  const entityType = segments[0] ?? "unknown";
  const last = segments[segments.length - 1] ?? "";
  const named = segments.filter((segment) => !segment.startsWith(":"));
  // "work-orders/:id/assign" -> "work-orders.assign"; "customers/:id" PATCH -> "customers.update".
  const parts = segments.length > 1 && !last.startsWith(":") ? named : [...named, verbs[req.method] ?? req.method];
  const data = (body as { data?: { id?: unknown } } | null)?.data;
  const entityId =
    typeof req.params.id === "string" ? req.params.id : typeof data?.id === "string" ? data.id : null;
  return { action: parts.join("."), entityType, entityId };
}

// Writes one AuditEvent for every successful mutation before the response is sent.
// The actor is the signed-in user, or res.locals.auditActor for unauthenticated flows
// such as login, accepting an invitation, or resetting a password.
export function audit(req: Request, res: Response, next: NextFunction) {
  if (!(req.method in verbs)) {
    next();
    return;
  }
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    const actor: AuditActor | undefined = req.user
      ? { organizationId: req.user.organizationId, actorId: req.user.id }
      : (res.locals.auditActor as AuditActor | undefined);
    if (res.statusCode >= 400 || !actor || !req.route) {
      return send(body);
    }
    const event = describe(req, body);
    prisma.auditEvent
      .create({
        data: {
          ...event,
          organizationId: actor.organizationId,
          actorId: actor.actorId,
          method: req.method,
          path: req.originalUrl.split("?")[0] ?? req.originalUrl,
          status: res.statusCode,
        },
      })
      .then(
        () => send(body),
        (error: unknown) => next(error),
      );
    return res;
  };
  const end = res.end.bind(res);
  // 204 responses (logout) skip res.json; record them too.
  res.end = ((...args: Parameters<typeof end>) => {
    const actor: AuditActor | undefined = req.user
      ? { organizationId: req.user.organizationId, actorId: req.user.id }
      : (res.locals.auditActor as AuditActor | undefined);
    if (res.statusCode !== 204 || !actor || !req.route || res.locals.auditWritten) {
      return end(...args);
    }
    res.locals.auditWritten = true;
    prisma.auditEvent
      .create({
        data: {
          ...describe(req, null),
          organizationId: actor.organizationId,
          actorId: actor.actorId,
          method: req.method,
          path: req.originalUrl.split("?")[0] ?? req.originalUrl,
          status: 204,
        },
      })
      .then(
        () => end(...args),
        (error: unknown) => next(error),
      );
    return res;
  }) as typeof res.end;
  next();
}
