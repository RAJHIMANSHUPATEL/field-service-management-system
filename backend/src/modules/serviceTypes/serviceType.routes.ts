import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as serviceTypeController from "./serviceType.controller.js";

export const serviceTypeRouter = Router();

const writers = requireRole("ADMIN", "OPS");
const readers = requireRole("ADMIN", "OPS", "CUSTOMER");

serviceTypeRouter.get("/", requireAuth, readers, serviceTypeController.list);
serviceTypeRouter.post("/", requireAuth, writers, serviceTypeController.create);
serviceTypeRouter.get("/:id", requireAuth, readers, serviceTypeController.get);
serviceTypeRouter.patch("/:id", requireAuth, writers, serviceTypeController.update);
