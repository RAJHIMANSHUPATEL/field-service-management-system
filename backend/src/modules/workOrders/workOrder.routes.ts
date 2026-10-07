import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as workOrderController from "./workOrder.controller.js";

export const workOrderRouter = Router();

const readers = requireRole("ADMIN", "OPS", "TECHNICIAN");
const writers = requireRole("ADMIN", "OPS");
const assignees = requireRole("TECHNICIAN");

workOrderRouter.get("/", requireAuth, readers, workOrderController.list);
workOrderRouter.get("/:id", requireAuth, readers, workOrderController.get);
workOrderRouter.get("/:id/candidates", requireAuth, writers, workOrderController.candidates);
workOrderRouter.post("/:id/reassign", requireAuth, writers, workOrderController.reassign);
workOrderRouter.post("/:id/assign", requireAuth, writers, workOrderController.assign);
workOrderRouter.post("/:id/schedule", requireAuth, writers, workOrderController.schedule);
workOrderRouter.post("/:id/notes", requireAuth, readers, workOrderController.addNote);
workOrderRouter.post("/:id/accept", requireAuth, assignees, workOrderController.accept);
workOrderRouter.post("/:id/decline", requireAuth, assignees, workOrderController.decline);
