import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import * as execution from "./visit.execution.js";
import {
  calendarQuerySchema,
  cancelVisitSchema,
  maxPhotoBytes,
  photoParamsSchema,
  rescheduleVisitSchema,
  signatureSchema,
  uploadPhotoSchema,
  visitParamsSchema,
  unsuccessfulVisitSchema,
  visitReportSchema,
} from "./visit.schema.js";
import { endUnsuccessful } from "./visit.outcome.js";
import * as visitService from "./visit.service.js";
import type { VisitStep } from "./visit.transitions.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

function step(name: VisitStep) {
  return async (req: Request, res: Response) => {
    const params = visitParamsSchema.parse(req.params);
    const result = await visitService.moveVisit(params.id, actor(req), name);
    res.status(200).json(result);
  };
}

export const enRoute = step("en-route");
export const arrive = step("arrive");
export const start = step("start");

export async function reschedule(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = rescheduleVisitSchema.parse(req.body);
  res.status(200).json(await visitService.rescheduleVisit(params.id, actor(req), body));
}

export async function cancel(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = cancelVisitSchema.parse(req.body);
  res.status(200).json(await visitService.cancelVisit(params.id, actor(req), body.reason));
}

export async function calendar(req: Request, res: Response) {
  const query = calendarQuerySchema.parse(req.query);
  res.status(200).json(await visitService.listCalendar(actor(req), query));
}

export const complete = step("complete");

export async function report(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = visitReportSchema.parse(req.body);
  res.status(200).json(await execution.saveReport(params.id, actor(req), body));
}

export async function uploadPhoto(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const meta = uploadPhotoSchema.parse({
    contentType: req.header("content-type")?.split(";")[0]?.trim(),
    fileName: req.header("x-file-name") ? decodeURIComponent(req.header("x-file-name") ?? "") : undefined,
    caption: req.header("x-caption") ? decodeURIComponent(req.header("x-caption") ?? "") : undefined,
  });
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (body.length > maxPhotoBytes) {
    throw new AppError("FILE_TOO_LARGE", 413, "Photos can be up to 10 MB");
  }
  res.status(201).json(await execution.addPhoto(params.id, actor(req), { body, ...meta }));
}

export async function photoUrl(req: Request, res: Response) {
  const params = photoParamsSchema.parse(req.params);
  res.status(200).json(await execution.photoUrl(params.id, params.photoId, actor(req)));
}

export async function signature(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = signatureSchema.parse(req.body);
  res.status(200).json(await execution.sign(params.id, actor(req), body));
}

export async function signatureUrl(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  res.status(200).json(await execution.signatureUrl(params.id, actor(req)));
}

export async function unsuccessful(req: Request, res: Response) {
  const params = visitParamsSchema.parse(req.params);
  const body = unsuccessfulVisitSchema.parse(req.body);
  res.status(200).json(await endUnsuccessful(params.id, actor(req), body));
}
