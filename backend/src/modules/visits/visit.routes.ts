import express, { Router } from "express";
import { maxPhotoBytes, photoTypes } from "./visit.schema.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as visitController from "./visit.controller.js";
import * as inventoryController from "../inventory/inventory.controller.js";

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
visitRouter.post("/:id/unsuccessful", requireAuth, assignees, visitController.unsuccessful);
visitRouter.post("/:id/complete", requireAuth, assignees, visitController.complete);

visitRouter.patch("/:id/report", requireAuth, assignees, visitController.report);
visitRouter.post(
  "/:id/photos",
  requireAuth,
  assignees,
  express.raw({ type: [...photoTypes], limit: maxPhotoBytes + 1 }),
  visitController.uploadPhoto,
);
visitRouter.get("/:id/photos/:photoId", requireAuth, visitController.photoUrl);
visitRouter.post("/:id/signature", requireAuth, assignees, visitController.signature);
visitRouter.get("/:id/signature", requireAuth, visitController.signatureUrl);

visitRouter.post("/:id/parts", requireAuth, assignees, inventoryController.addVisitPart);
visitRouter.post("/:id/parts/:visitPartId/consume", requireAuth, assignees, inventoryController.consumeVisitPart);
visitRouter.post("/:id/parts/:visitPartId/release", requireAuth, assignees, inventoryController.releaseVisitPart);
visitRouter.post("/:id/parts/:visitPartId/return", requireAuth, assignees, inventoryController.returnVisitPart);
