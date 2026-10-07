import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { audit } from "./middleware/audit.js";
import { auditEventRouter } from "./modules/auditEvents/auditEvent.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { assetRouter } from "./modules/assets/asset.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";
import { serviceRequestRouter } from "./modules/serviceRequests/serviceRequest.routes.js";
import { serviceTypeRouter } from "./modules/serviceTypes/serviceType.routes.js";
import { technicianRouter } from "./modules/technicians/technician.routes.js";
import { workOrderRouter } from "./modules/workOrders/workOrder.routes.js";
import { visitRouter } from "./modules/visits/visit.routes.js";
import { skillRouter } from "./modules/skills/skill.routes.js";
import { serviceAreaRouter } from "./modules/serviceAreas/serviceArea.routes.js";
import { partRouter } from "./modules/parts/part.routes.js";
import { contractRouter } from "./modules/contracts/contract.routes.js";
import { markOverdue } from "./modules/invoices/invoice.service.js";
import { invoiceRouter } from "./modules/invoices/invoice.routes.js";
import { partRequestRouter } from "./modules/partRequests/partRequest.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { feedbackRouter } from "./modules/feedback/feedback.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { runSweeps } from "./modules/notifications/notification.events.js";
import { startNotificationWorker } from "./lib/queue.js";
import { maintenanceRouter } from "./modules/maintenance/maintenance.routes.js";
import { generateDue } from "./modules/maintenance/maintenance.service.js";
import { warehouseRouter } from "./modules/warehouses/warehouse.routes.js";
import "./types/authUser.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "3mb" })); // room for a signature PNG data URL
  app.use(requestLogger);
  app.use("/api/v1", audit);

  app.get("/health", (_req, res) => {
    res.status(200).json({ data: { status: "ok" } });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/assets", assetRouter);
  app.use("/api/v1/service-types", serviceTypeRouter);
  app.use("/api/v1/service-requests", serviceRequestRouter);
  app.use("/api/v1/technicians", technicianRouter);
  app.use("/api/v1/work-orders", workOrderRouter);
  app.use("/api/v1/visits", visitRouter);
  app.use("/api/v1/users", userRouter);
  app.use("/api/v1/skills", skillRouter);
  app.use("/api/v1/service-areas", serviceAreaRouter);
  app.use("/api/v1/parts", partRouter);
  app.use("/api/v1/warehouses", warehouseRouter);
  app.use("/api/v1/inventory", inventoryRouter);
  app.use("/api/v1/part-requests", partRequestRouter);
  app.use("/api/v1/contracts", contractRouter);
  app.use("/api/v1/invoices", invoiceRouter);
  app.use("/api/v1/maintenance-plans", maintenanceRouter);
  app.use("/api/v1/feedback", feedbackRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/audit-events", auditEventRouter);
  app.get("/api/v1/admin/ping", requireAuth, requireRole("ADMIN"), (_req, res) => {
    res.status(200).json({ data: { ok: true } });
  });

  app.use(errorHandler);
  return app;
}

export const app = createApp();

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
  // Overdue detection also runs before every invoice read; the timer keeps idle orgs current.
  setInterval(() => {
    markOverdue().catch((error: unknown) => console.error("Overdue sweep failed", error));
  }, 60 * 60_000).unref();
  // Deliveries run on the BullMQ worker; delayed-job and contract-expiry checks every 5 minutes.
  startNotificationWorker();
  setInterval(() => {
    runSweeps().catch((error: unknown) => console.error("Notification sweep failed", error));
  }, 5 * 60_000).unref();
  // Due maintenance plans open their work orders without anyone pressing a button.
  const maintenanceEvery = Number(process.env.MAINTENANCE_SWEEP_MS ?? 15 * 60_000);
  const generate = () => generateDue().catch((error: unknown) => console.error("Maintenance sweep failed", error));
  void generate();
  setInterval(generate, maintenanceEvery).unref();
}
