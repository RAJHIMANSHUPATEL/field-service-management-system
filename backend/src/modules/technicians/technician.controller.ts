import type { Request, Response } from "express";
import { pageQuerySchema } from "../../lib/pagination.js";
import { createTechnicianSchema, createTimeOffSchema, updateTechnicianSchema } from "./technician.schema.js";
import * as technicianService from "./technician.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = pageQuerySchema.parse(req.query);
  const result = await technicianService.listTechnicians(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await technicianService.getTechnician(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response) {
  const body = createTechnicianSchema.parse(req.body);
  const result = await technicianService.createTechnician(body, actor(req));
  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const body = updateTechnicianSchema.parse(req.body);
  const result = await technicianService.updateTechnician(String(req.params.id), body, actor(req));
  res.status(200).json(result);
}

export async function listTimeOff(req: Request, res: Response) {
  res.status(200).json(await technicianService.listTimeOff(String(req.params.id), actor(req)));
}

export async function addTimeOff(req: Request, res: Response) {
  const body = createTimeOffSchema.parse(req.body);
  res.status(201).json(await technicianService.addTimeOff(String(req.params.id), body, actor(req)));
}

export async function removeTimeOff(req: Request, res: Response) {
  await technicianService.removeTimeOff(String(req.params.id), String(req.params.timeOffId), actor(req));
  res.status(204).send();
}
