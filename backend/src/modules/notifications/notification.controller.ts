import type { Request, Response } from "express";
import { listDeliveriesQuerySchema, updateRuleSchema } from "./notification.schema.js";
import * as notificationService from "./notification.service.js";
import { runSweeps } from "./notification.events.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function inbox(req: Request, res: Response) {
  res.status(200).json(await notificationService.inbox(actor(req)));
}

export async function read(req: Request, res: Response) {
  res.status(200).json(await notificationService.markRead(String(req.params.id), actor(req)));
}

export async function deliveries(req: Request, res: Response) {
  res.status(200).json(await notificationService.listDeliveries(actor(req), listDeliveriesQuerySchema.parse(req.query)));
}

export async function retry(req: Request, res: Response) {
  res.status(200).json(await notificationService.retry(String(req.params.id), actor(req)));
}

export async function rules(req: Request, res: Response) {
  res.status(200).json(await notificationService.listRules(actor(req)));
}

export async function updateRule(req: Request, res: Response) {
  res.status(200).json(await notificationService.updateRule(String(req.params.id), actor(req), updateRuleSchema.parse(req.body)));
}

export async function sweep(req: Request, res: Response) {
  res.status(200).json({ data: { notified: await runSweeps(new Date(), actor(req).organizationId) } });
}
