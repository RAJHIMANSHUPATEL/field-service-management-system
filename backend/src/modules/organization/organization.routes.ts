import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as organizationController from "./organization.controller.js";

// The signed-in user's own organisation: company settings such as the GST state.
export const organizationRouter = Router();

organizationRouter.get("/", requireAuth, requireRole("ADMIN", "OPS"), organizationController.get);
organizationRouter.patch("/", requireAuth, requireRole("ADMIN"), organizationController.update);
organizationRouter.get("/gst-states", requireAuth, requireRole("ADMIN", "OPS"), organizationController.gstStates);
