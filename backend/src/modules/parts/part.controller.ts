import type { Request, Response } from "express";
import { z } from "zod";
import { createPartSchema, listPartsQuerySchema, updatePartSchema } from "./part.schema.js";
import * as partService from "./part.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listPartsQuerySchema.parse(req.query);
  res.status(200).json(await partService.listParts(actor(req), query));
}

export async function get(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  res.status(200).json(await partService.getPart(id, actor(req)));
}

export async function create(req: Request, res: Response) {
  const body = createPartSchema.parse(req.body);
  res.status(201).json(await partService.createPart(body, actor(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  const body = updatePartSchema.parse(req.body);
  res.status(200).json(await partService.updatePart(id, body, actor(req)));
}
