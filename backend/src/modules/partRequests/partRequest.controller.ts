import type { Request, Response } from "express";
import { listPartRequestsQuerySchema, resolvePartRequestSchema } from "./partRequest.schema.js";
import * as partRequestService from "./partRequest.service.js";
import type { PartRequestAction } from "./partRequest.transitions.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  res.status(200).json(await partRequestService.listPartRequests(actor(req), listPartRequestsQuerySchema.parse(req.query)));
}

function resolve(action: PartRequestAction) {
  return async (req: Request, res: Response) => {
    const body = resolvePartRequestSchema.parse(req.body ?? {});
    res.status(200).json(await partRequestService.resolvePartRequest(String(req.params.id), actor(req), action, body.note));
  };
}

export const fulfil = resolve("fulfil");
export const cancel = resolve("cancel");
