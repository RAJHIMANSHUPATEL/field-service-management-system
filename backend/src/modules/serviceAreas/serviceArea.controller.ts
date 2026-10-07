import type { Request, Response } from "express";
import { z } from "zod";
import { createServiceAreaSchema, listServiceAreasQuerySchema, updateServiceAreaSchema } from "./serviceArea.schema.js";
import * as serviceAreaService from "./serviceArea.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listServiceAreasQuerySchema.parse(req.query);
  res.status(200).json(await serviceAreaService.listServiceAreas(actor(req), query));
}

export async function get(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  res.status(200).json(await serviceAreaService.getServiceArea(id, actor(req)));
}

export async function create(req: Request, res: Response) {
  const body = createServiceAreaSchema.parse(req.body);
  res.status(201).json(await serviceAreaService.createServiceArea(body, actor(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  const body = updateServiceAreaSchema.parse(req.body);
  res.status(200).json(await serviceAreaService.updateServiceArea(id, body, actor(req)));
}
