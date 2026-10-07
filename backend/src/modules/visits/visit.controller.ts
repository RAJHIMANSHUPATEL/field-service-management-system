import type { Request, Response } from "express";
import { visitParamsSchema } from "./visit.schema.js";
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
