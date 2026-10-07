import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import {
  acceptServiceRequestSchema,
  attachmentParamsSchema,
  maxAttachmentBytes,
  uploadAttachmentSchema,
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

// The file is the raw request body. Content-Type names the file type and X-File-Name its name.
export async function uploadAttachment(req: Request, res: Response) {
  const meta = uploadAttachmentSchema.parse({
    contentType: req.header("content-type")?.split(";")[0]?.trim(),
    fileName: req.header("x-file-name") ? decodeURIComponent(req.header("x-file-name") ?? "") : undefined,
  });
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (body.length > maxAttachmentBytes) {
    throw new AppError("FILE_TOO_LARGE", 413, "Files can be up to 10 MB");
  }
  const result = await serviceRequestService.addAttachment(
    String(req.params.id),
    { body, contentType: meta.contentType, fileName: meta.fileName },
    actor(req),
  );
  res.status(201).json(result);
}

export async function attachmentUrl(req: Request, res: Response) {
  const params = attachmentParamsSchema.parse(req.params);
  const result = await serviceRequestService.attachmentUrl(params.id, params.attachmentId, actor(req));
  res.status(200).json(result);
}
