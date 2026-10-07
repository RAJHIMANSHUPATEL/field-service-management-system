import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as notificationController from "./notification.controller.js";

export const notificationRouter = Router();

const admin = requireRole("ADMIN");
const office = requireRole("ADMIN", "OPS");

notificationRouter.get("/", requireAuth, notificationController.inbox);
notificationRouter.get("/deliveries", requireAuth, office, notificationController.deliveries);
notificationRouter.get("/rules", requireAuth, admin, notificationController.rules);
notificationRouter.patch("/rules/:id", requireAuth, admin, notificationController.updateRule);
notificationRouter.post("/sweep", requireAuth, office, notificationController.sweep);
notificationRouter.post("/deliveries/:id/retry", requireAuth, office, notificationController.retry);
notificationRouter.post("/:id/read", requireAuth, notificationController.read);
