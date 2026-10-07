import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as authController from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", authController.registerOrganization);
authRouter.post("/login", authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.post("/password-reset/request", authController.requestPasswordReset);
authRouter.post("/password-reset/confirm", authController.confirmPasswordReset);
authRouter.post("/invitations/accept", authController.acceptInvitation);
authRouter.get("/me", requireAuth, authController.me);
