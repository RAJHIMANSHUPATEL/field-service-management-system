import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as contractController from "./contract.controller.js";

export const contractRouter = Router();

const office = requireRole("ADMIN", "OPS");
const readers = requireRole("ADMIN", "OPS", "CUSTOMER");

contractRouter.get("/", requireAuth, readers, contractController.list);
contractRouter.post("/", requireAuth, office, contractController.create);
contractRouter.get("/:id", requireAuth, readers, contractController.get);
contractRouter.post("/:id/cancel", requireAuth, office, contractController.cancel);
