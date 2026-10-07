import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { audit } from "./middleware/audit.js";
import { idempotency } from "./middleware/idempotency.js";
import { apiLimiter, authLimiter } from "./middleware/rateLimit.js";
import { openapiDocument } from "./docs/openapi.js";
import { markOverdue } from "./modules/invoices/invoice.service.js";
import { runSweeps } from "./modules/notifications/notification.events.js";
import { startNotificationWorker } from "./lib/queue.js";
import { generateDue } from "./modules/maintenance/maintenance.service.js";
import { mounts } from "./routes/mounts.js";
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
  app.set("trust proxy", process.env.TRUST_PROXY === "true");
  app.use("/api/v1", apiLimiter());
  for (const path of ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/password-reset"] as const) {
    app.use(path, authLimiter());
  }
  app.use("/api/v1", idempotency);
  app.use("/api/v1", audit);

  app.get("/health", (_req, res) => {
    res.status(200).json({ data: { status: "ok" } });
  });

  app.get("/api/v1/openapi.json", (_req, res) => {
    res.status(200).json(openapiDocument());
  });
  for (const [path, router] of mounts) {
    app.use(path, router);
  }
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
