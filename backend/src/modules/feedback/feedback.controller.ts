import type { Request, Response } from "express";
import { createFeedbackSchema, listFeedbackQuerySchema } from "./feedback.schema.js";
import * as feedbackService from "./feedback.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await feedbackService.createFeedback(String(req.params.id), actor(req), createFeedbackSchema.parse(req.body)));
}

export async function list(req: Request, res: Response) {
  res.status(200).json(await feedbackService.listFeedback(actor(req), listFeedbackQuerySchema.parse(req.query)));
}
