import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as analyticsController from "./analytics.controller.js";

export const analyticsRouter = Router();

const office = requireRole("ADMIN", "OPS");

analyticsRouter.get("/dashboard", requireAuth, office, analyticsController.dashboard);
analyticsRouter.get("/technicians", requireAuth, office, analyticsController.technicians);
