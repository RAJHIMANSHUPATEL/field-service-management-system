import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as inventoryController from "./inventory.controller.js";

export const inventoryRouter = Router();

const readers = requireRole("ADMIN", "OPS", "TECHNICIAN");
const writers = requireRole("ADMIN", "OPS");

inventoryRouter.get("/stock", requireAuth, readers, inventoryController.stock);
inventoryRouter.get("/movements", requireAuth, readers, inventoryController.movements);
inventoryRouter.post("/receipts", requireAuth, writers, inventoryController.receive);
inventoryRouter.post("/transfers", requireAuth, writers, inventoryController.transfer);
inventoryRouter.post("/adjustments", requireAuth, writers, inventoryController.adjust);
