import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as feedbackController from "./feedback.controller.js";

export const feedbackRouter = Router();

feedbackRouter.get("/", requireAuth, requireRole("ADMIN", "OPS"), feedbackController.list);
