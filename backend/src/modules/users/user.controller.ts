import type { Request, Response } from "express";
import { createInvitationSchema, invitationParamsSchema, listUsersQuerySchema } from "./user.schema.js";
import * as userService from "./user.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listUsersQuerySchema.parse(req.query);
  res.status(200).json(await userService.listUsers(actor(req), query));
}

export async function listInvitations(req: Request, res: Response) {
  const query = listUsersQuerySchema.parse(req.query);
  res.status(200).json(await userService.listInvitations(actor(req), query));
}

export async function invite(req: Request, res: Response) {
  const body = createInvitationSchema.parse(req.body);
  res.status(201).json(await userService.createInvitation(actor(req), body));
}

export async function revokeInvitation(req: Request, res: Response) {
  const params = invitationParamsSchema.parse(req.params);
  res.status(200).json(await userService.revokeInvitation(params.id, actor(req)));
}
