import type { Request, Response } from "express";
import { z } from "zod";
import { createSkillSchema, listSkillsQuerySchema, updateSkillSchema } from "./skill.schema.js";
import * as skillService from "./skill.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listSkillsQuerySchema.parse(req.query);
  res.status(200).json(await skillService.listSkills(actor(req), query));
}

export async function get(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  res.status(200).json(await skillService.getSkill(id, actor(req)));
}

export async function create(req: Request, res: Response) {
  const body = createSkillSchema.parse(req.body);
  res.status(201).json(await skillService.createSkill(body, actor(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = paramsSchema.parse(req.params);
  const body = updateSkillSchema.parse(req.body);
  res.status(200).json(await skillService.updateSkill(id, body, actor(req)));
}
