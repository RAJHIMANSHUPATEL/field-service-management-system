import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as maintenanceController from "./maintenance.controller.js";

export const maintenanceRouter = Router();

const office = requireRole("ADMIN", "OPS");
const readers = requireRole("ADMIN", "OPS", "CUSTOMER");

maintenanceRouter.get("/", requireAuth, readers, maintenanceController.list);
maintenanceRouter.post("/", requireAuth, office, maintenanceController.create);
maintenanceRouter.post("/run", requireAuth, office, maintenanceController.run);
maintenanceRouter.get("/:id", requireAuth, readers, maintenanceController.get);
maintenanceRouter.patch("/:id", requireAuth, office, maintenanceController.update);
maintenanceRouter.post("/:id/pause", requireAuth, office, maintenanceController.pause);
maintenanceRouter.post("/:id/resume", requireAuth, office, maintenanceController.resume);
