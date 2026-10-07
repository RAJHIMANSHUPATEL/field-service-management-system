import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as warehouseController from "./warehouse.controller.js";

export const warehouseRouter = Router();

const readers = requireRole("ADMIN", "OPS", "TECHNICIAN");
const writers = requireRole("ADMIN", "OPS");

warehouseRouter.get("/", requireAuth, readers, warehouseController.list);
warehouseRouter.post("/", requireAuth, writers, warehouseController.create);
warehouseRouter.get("/:id", requireAuth, readers, warehouseController.get);
warehouseRouter.patch("/:id", requireAuth, writers, warehouseController.update);
