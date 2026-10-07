import type { Request, Response } from "express";
import {
  addVisitPartSchema,
  adjustmentSchema,
  movementQuerySchema,
  receiptSchema,
  returnVisitPartSchema,
  stockQuerySchema,
  transferSchema,
  visitPartParamsSchema,
} from "./inventory.schema.js";
import * as inventoryService from "./inventory.service.js";
import * as visitPartService from "./visitPart.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function stock(req: Request, res: Response) {
  res.status(200).json(await inventoryService.listStock(actor(req), stockQuerySchema.parse(req.query)));
}

export async function movements(req: Request, res: Response) {
  res.status(200).json(await inventoryService.listMovements(actor(req), movementQuerySchema.parse(req.query)));
}

export async function receive(req: Request, res: Response) {
  res.status(201).json(await inventoryService.receive(actor(req), receiptSchema.parse(req.body)));
}

export async function transfer(req: Request, res: Response) {
  res.status(201).json(await inventoryService.transfer(actor(req), transferSchema.parse(req.body)));
}

export async function adjust(req: Request, res: Response) {
  res.status(201).json(await inventoryService.adjust(actor(req), adjustmentSchema.parse(req.body)));
}

export async function addVisitPart(req: Request, res: Response) {
  const body = addVisitPartSchema.parse(req.body);
  res.status(201).json(await visitPartService.addVisitPart(String(req.params.id), actor(req), body));
}

export async function consumeVisitPart(req: Request, res: Response) {
  const params = visitPartParamsSchema.parse(req.params);
  res.status(200).json(await visitPartService.moveVisitPart(params.id, params.visitPartId, actor(req), "consume"));
}

export async function releaseVisitPart(req: Request, res: Response) {
  const params = visitPartParamsSchema.parse(req.params);
  res.status(200).json(await visitPartService.moveVisitPart(params.id, params.visitPartId, actor(req), "release"));
}

export async function returnVisitPart(req: Request, res: Response) {
  const params = visitPartParamsSchema.parse(req.params);
  const body = returnVisitPartSchema.parse(req.body);
  res
    .status(200)
    .json(await visitPartService.moveVisitPart(params.id, params.visitPartId, actor(req), "return", body.reason));
}
