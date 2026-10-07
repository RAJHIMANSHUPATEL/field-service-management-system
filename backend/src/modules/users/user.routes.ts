import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as userController from "./user.controller.js";

export const userRouter = Router();

const admins = requireRole("ADMIN");

userRouter.get("/", requireAuth, admins, userController.list);
userRouter.get("/invitations", requireAuth, admins, userController.listInvitations);
userRouter.post("/invitations", requireAuth, admins, userController.invite);
userRouter.post("/invitations/:id/revoke", requireAuth, admins, userController.revokeInvitation);
