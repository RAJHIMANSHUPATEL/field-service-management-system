import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as visitController from "./visit.controller.js";

export const visitRouter = Router();

const assignees = requireRole("TECHNICIAN");
const planners = requireRole("ADMIN", "OPS");
const readers = requireRole("ADMIN", "OPS", "TECHNICIAN");

visitRouter.get("/", requireAuth, readers, visitController.calendar);
visitRouter.post("/:id/reschedule", requireAuth, planners, visitController.reschedule);
visitRouter.post("/:id/cancel", requireAuth, planners, visitController.cancel);

visitRouter.post("/:id/en-route", requireAuth, assignees, visitController.enRoute);
visitRouter.post("/:id/arrive", requireAuth, assignees, visitController.arrive);
visitRouter.post("/:id/start", requireAuth, assignees, visitController.start);
