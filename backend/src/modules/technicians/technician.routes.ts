import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as technicianController from "./technician.controller.js";

export const technicianRouter = Router();

const readRoles = requireRole("ADMIN", "OPS", "TECHNICIAN");
const writeRoles = requireRole("ADMIN", "OPS");

technicianRouter.get("/", requireAuth, readRoles, technicianController.list);
technicianRouter.post("/", requireAuth, writeRoles, technicianController.create);
technicianRouter.get("/:id", requireAuth, readRoles, technicianController.get);
technicianRouter.patch("/:id", requireAuth, writeRoles, technicianController.update);
