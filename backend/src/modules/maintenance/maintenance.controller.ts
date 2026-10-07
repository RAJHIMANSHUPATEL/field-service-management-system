import type { Request, Response } from "express";
import { createPlanSchema, listPlansQuerySchema, updatePlanSchema } from "./maintenance.schema.js";
import * as maintenanceService from "./maintenance.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  res.status(200).json(await maintenanceService.listPlans(actor(req), listPlansQuerySchema.parse(req.query)));
}

export async function get(req: Request, res: Response) {
  res.status(200).json(await maintenanceService.getPlan(String(req.params.id), actor(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await maintenanceService.createPlan(actor(req), createPlanSchema.parse(req.body)));
}

export async function update(req: Request, res: Response) {
  res.status(200).json(await maintenanceService.updatePlan(String(req.params.id), actor(req), updatePlanSchema.parse(req.body)));
}

export async function pause(req: Request, res: Response) {
  res.status(200).json(await maintenanceService.movePlan(String(req.params.id), actor(req), "pause"));
}

export async function resume(req: Request, res: Response) {
  res.status(200).json(await maintenanceService.movePlan(String(req.params.id), actor(req), "resume"));
}

export async function run(req: Request, res: Response) {
  res.status(200).json({ data: await maintenanceService.generateDue(new Date(), actor(req).organizationId) });
}
