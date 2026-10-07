import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as partController from "./part.controller.js";

export const partRouter = Router();

const readers = requireRole("ADMIN", "OPS", "TECHNICIAN");
const writers = requireRole("ADMIN", "OPS");

partRouter.get("/", requireAuth, readers, partController.list);
partRouter.post("/", requireAuth, writers, partController.create);
partRouter.get("/:id", requireAuth, readers, partController.get);
partRouter.patch("/:id", requireAuth, writers, partController.update);
