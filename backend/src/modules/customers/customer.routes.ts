import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as customerController from "./customer.controller.js";

export const customerRouter = Router();

const readRoles = requireRole("ADMIN", "OPS", "CUSTOMER");
const writeRoles = requireRole("ADMIN", "OPS");

customerRouter.get("/", requireAuth, readRoles, customerController.list);
customerRouter.post("/", requireAuth, writeRoles, customerController.create);
customerRouter.get("/:id", requireAuth, readRoles, customerController.get);
customerRouter.patch("/:id", requireAuth, writeRoles, customerController.update);
customerRouter.post("/:id/contacts", requireAuth, writeRoles, customerController.createContact);
customerRouter.patch(
  "/:customerId/contacts/:contactId",
  requireAuth,
  writeRoles,
  customerController.updateContact,
);
customerRouter.post("/:id/addresses", requireAuth, writeRoles, customerController.createAddress);
customerRouter.patch(
  "/:customerId/addresses/:addressId",
  requireAuth,
  writeRoles,
  customerController.updateAddress,
);
