import type { Request, Response } from "express";
import { listAuditEventsQuerySchema } from "./auditEvent.schema.js";
import * as auditEventService from "./auditEvent.service.js";

export async function list(req: Request, res: Response) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  const query = listAuditEventsQuerySchema.parse(req.query);
  res.status(200).json(await auditEventService.listAuditEvents(req.user, query));
}
