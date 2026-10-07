import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import * as invoiceController from "./invoice.controller.js";

export const invoiceRouter = Router();

const office = requireRole("ADMIN", "OPS");
const readers = requireRole("ADMIN", "OPS", "CUSTOMER");

invoiceRouter.get("/", requireAuth, readers, invoiceController.list);
invoiceRouter.post("/mark-overdue", requireAuth, office, invoiceController.markOverdue);
invoiceRouter.get("/:id", requireAuth, readers, invoiceController.get);
invoiceRouter.patch("/:id", requireAuth, office, invoiceController.update);
invoiceRouter.post("/:id/lines", requireAuth, office, invoiceController.addLine);
invoiceRouter.post("/:id/issue", requireAuth, office, invoiceController.issue);
invoiceRouter.post("/:id/payments", requireAuth, office, invoiceController.recordPayment);
invoiceRouter.post("/:id/pay", requireAuth, requireRole("CUSTOMER"), invoiceController.pay);
invoiceRouter.post("/:id/void", requireAuth, office, invoiceController.voidInvoice);
