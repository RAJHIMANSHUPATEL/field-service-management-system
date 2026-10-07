import type { Request, Response } from "express";
import { periodQuerySchema } from "./analytics.schema.js";
import * as analyticsService from "./analytics.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function dashboard(req: Request, res: Response) {
  res.status(200).json(await analyticsService.dashboard(actor(req)));
}

export async function technicians(req: Request, res: Response) {
  res.status(200).json(await analyticsService.technicianPerformance(actor(req), periodQuerySchema.parse(req.query)));
}
