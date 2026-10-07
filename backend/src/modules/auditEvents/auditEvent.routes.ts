import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as auditEventController from "./auditEvent.controller.js";

export const auditEventRouter = Router();

auditEventRouter.get("/", requireAuth, requireRole("ADMIN"), auditEventController.list);
