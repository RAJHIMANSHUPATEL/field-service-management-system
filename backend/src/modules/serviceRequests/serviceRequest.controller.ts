import type { Request, Response } from "express";
import {
  acceptServiceRequestSchema,
  createServiceRequestSchema,
  listServiceRequestsQuerySchema,
  messageSchema,
  reasonSchema,
} from "./serviceRequest.schema.js";
import * as serviceRequestService from "./serviceRequest.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listServiceRequestsQuerySchema.parse(req.query);
  const result = await serviceRequestService.listServiceRequests(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await serviceRequestService.getServiceRequest(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response) {
  const body = createServiceRequestSchema.parse(req.body);
  const result = await serviceRequestService.createServiceRequest(body, actor(req));
  res.status(201).json(result);
}

export async function accept(req: Request, res: Response) {
  const body = acceptServiceRequestSchema.parse(req.body ?? {});
  const result = await serviceRequestService.acceptServiceRequest(String(req.params.id), body, actor(req));
  res.status(200).json(result);
}

export async function reject(req: Request, res: Response) {
  const body = reasonSchema.parse(req.body);
  const result = await serviceRequestService.rejectServiceRequest(String(req.params.id), body.reason, actor(req));
  res.status(200).json(result);
}

export async function requestInfo(req: Request, res: Response) {
  const body = messageSchema.parse(req.body);
  const result = await serviceRequestService.requestInfo(String(req.params.id), body.message, actor(req));
  res.status(200).json(result);
}

export async function reply(req: Request, res: Response) {
  const body = messageSchema.parse(req.body);
  const result = await serviceRequestService.replyToRequest(String(req.params.id), body.message, actor(req));
  res.status(200).json(result);
}
