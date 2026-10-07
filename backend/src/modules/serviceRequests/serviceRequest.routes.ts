import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as serviceRequestController from "./serviceRequest.controller.js";

export const serviceRequestRouter = Router();

const readRoles = requireRole("ADMIN", "OPS", "CUSTOMER");
const triageRoles = requireRole("ADMIN", "OPS");

serviceRequestRouter.get("/", requireAuth, readRoles, serviceRequestController.list);
serviceRequestRouter.post("/", requireAuth, readRoles, serviceRequestController.create);
serviceRequestRouter.get("/:id", requireAuth, readRoles, serviceRequestController.get);
serviceRequestRouter.post("/:id/accept", requireAuth, triageRoles, serviceRequestController.accept);
serviceRequestRouter.post("/:id/reject", requireAuth, triageRoles, serviceRequestController.reject);
serviceRequestRouter.post("/:id/request-info", requireAuth, triageRoles, serviceRequestController.requestInfo);
serviceRequestRouter.post("/:id/reply", requireAuth, readRoles, serviceRequestController.reply);
