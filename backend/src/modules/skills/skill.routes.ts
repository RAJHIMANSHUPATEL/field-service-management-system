import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as skillController from "./skill.controller.js";

export const skillRouter = Router();

const readers = requireRole("ADMIN", "OPS");
const writers = requireRole("ADMIN", "OPS");

skillRouter.get("/", requireAuth, readers, skillController.list);
skillRouter.post("/", requireAuth, writers, skillController.create);
skillRouter.get("/:id", requireAuth, readers, skillController.get);
skillRouter.patch("/:id", requireAuth, writers, skillController.update);
