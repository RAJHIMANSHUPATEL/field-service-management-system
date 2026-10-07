import type { Request, Response } from "express";
import { z } from "zod";
import { createWarehouseSchema, listWarehousesQuerySchema, updateWarehouseSchema } from "./warehouse.schema.js";
import * as warehouseService from "./warehouse.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listWarehousesQuerySchema.parse(req.query);
  res.status(200).json(await warehouseService.listWarehouses(actor(req), query));
}

export async function get(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  res.status(200).json(await warehouseService.getWarehouse(id, actor(req)));
}

export async function create(req: Request, res: Response) {
  const body = createWarehouseSchema.parse(req.body);
  res.status(201).json(await warehouseService.createWarehouse(body, actor(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  const body = updateWarehouseSchema.parse(req.body);
  res.status(200).json(await warehouseService.updateWarehouse(id, body, actor(req)));
}
