import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as partRequestController from "./partRequest.controller.js";

export const partRequestRouter = Router();

const writers = requireRole("ADMIN", "OPS");

partRequestRouter.get("/", requireAuth, writers, partRequestController.list);
partRequestRouter.post("/:id/fulfil", requireAuth, writers, partRequestController.fulfil);
partRequestRouter.post("/:id/cancel", requireAuth, writers, partRequestController.cancel);
