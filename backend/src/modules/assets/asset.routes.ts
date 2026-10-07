import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as assetController from "./asset.controller.js";

export const assetRouter = Router();

const readRoles = requireRole("ADMIN", "OPS", "CUSTOMER");
const writeRoles = requireRole("ADMIN", "OPS");

assetRouter.get("/", requireAuth, readRoles, assetController.list);
assetRouter.post("/", requireAuth, writeRoles, assetController.create);
assetRouter.get("/:id", requireAuth, readRoles, assetController.get);
assetRouter.patch("/:id", requireAuth, writeRoles, assetController.update);
