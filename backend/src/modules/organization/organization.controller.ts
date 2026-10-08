import type { Request, Response } from "express";
import { updateOrganizationSchema } from "./organization.schema.js";
import * as organizationService from "./organization.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function get(req: Request, res: Response) {
  res.status(200).json(await organizationService.getOrganization(actor(req)));
}

export async function update(req: Request, res: Response) {
  const body = updateOrganizationSchema.parse(req.body);
  res.status(200).json(await organizationService.updateOrganization(actor(req), body));
}

export function gstStates(_req: Request, res: Response) {
  res.status(200).json(organizationService.listGstStates());
}
