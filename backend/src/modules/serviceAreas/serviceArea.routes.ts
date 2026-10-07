import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as serviceAreaController from "./serviceArea.controller.js";

export const serviceAreaRouter = Router();

const readers = requireRole("ADMIN", "OPS");
const writers = requireRole("ADMIN", "OPS");

serviceAreaRouter.get("/", requireAuth, readers, serviceAreaController.list);
serviceAreaRouter.post("/", requireAuth, writers, serviceAreaController.create);
serviceAreaRouter.get("/:id", requireAuth, readers, serviceAreaController.get);
serviceAreaRouter.patch("/:id", requireAuth, writers, serviceAreaController.update);
