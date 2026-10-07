import type { Request, Response } from "express";
import { pageQuerySchema } from "../../lib/pagination.js";
import {
  createServiceTypeSchema,
  updateServiceTypeSchema,
} from "./serviceType.schema.js";
import * as serviceTypeService from "./serviceType.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = pageQuerySchema.parse(req.query);
  const result = await serviceTypeService.listServiceTypes(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await serviceTypeService.getServiceType(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response) {
  const body = createServiceTypeSchema.parse(req.body);
  const result = await serviceTypeService.createServiceType(body, actor(req));
  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const body = updateServiceTypeSchema.parse(req.body);
  const result = await serviceTypeService.updateServiceType(String(req.params.id), body, actor(req));
  res.status(200).json(result);
}
