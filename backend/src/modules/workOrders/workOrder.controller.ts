import type { Request, Response } from "express";
import {
  assignWorkOrderSchema,
  candidatesQuerySchema,
  reassignWorkOrderSchema,
  declineWorkOrderSchema,
  listWorkOrdersQuerySchema,
  scheduleWorkOrderSchema,
} from "./workOrder.schema.js";
import * as workOrderService from "./workOrder.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listWorkOrdersQuerySchema.parse(req.query);
  const result = await workOrderService.listWorkOrders(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await workOrderService.getWorkOrder(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function assign(req: Request, res: Response) {
  const body = assignWorkOrderSchema.parse(req.body);
  const result = await workOrderService.assignWorkOrder(String(req.params.id), actor(req), body);
  res.status(200).json(result);
}

export async function schedule(req: Request, res: Response) {
  const body = scheduleWorkOrderSchema.parse(req.body);
  const result = await workOrderService.scheduleWorkOrder(String(req.params.id), actor(req), body);
  res.status(200).json(result);
}

export async function accept(req: Request, res: Response) {
  const result = await workOrderService.acceptWorkOrder(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function decline(req: Request, res: Response) {
  const body = declineWorkOrderSchema.parse(req.body);
  const result = await workOrderService.declineWorkOrder(String(req.params.id), actor(req), body.reason);
  res.status(200).json(result);
}

export async function reassign(req: Request, res: Response) {
  const body = reassignWorkOrderSchema.parse(req.body);
  const result = await workOrderService.reassignWorkOrder(String(req.params.id), actor(req), body);
  res.status(200).json(result);
}

export async function candidates(req: Request, res: Response) {
  const query = candidatesQuerySchema.parse(req.query);
  const result = await workOrderService.technicianCandidates(String(req.params.id), actor(req), query.at);
  res.status(200).json(result);
}
