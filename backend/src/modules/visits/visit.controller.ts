import type { Request, Response } from "express";
import { calendarQuerySchema, cancelVisitSchema, rescheduleVisitSchema, visitParamsSchema } from "./visit.schema.js";
import * as visitService from "./visit.service.js";
import type { VisitStep } from "./visit.transitions.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

function step(name: VisitStep) {
  return async (req: Request, res: Response) => {
    const params = visitParamsSchema.parse(req.params);
    const result = await visitService.moveVisit(params.id, actor(req), name);
    res.status(200).json(result);
  };
}

export const enRoute = step("en-route");
export const arrive = step("arrive");
export const start = step("start");

export async function reschedule(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = rescheduleVisitSchema.parse(req.body);
  res.status(200).json(await visitService.rescheduleVisit(params.id, actor(req), body));
}

export async function cancel(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = cancelVisitSchema.parse(req.body);
  res.status(200).json(await visitService.cancelVisit(params.id, actor(req), body.reason));
}

export async function calendar(req: Request, res: Response) {
  const query = calendarQuerySchema.parse(req.query);
  res.status(200).json(await visitService.listCalendar(actor(req), query));
}
