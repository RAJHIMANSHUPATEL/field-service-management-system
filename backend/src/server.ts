import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { assetRouter } from "./modules/assets/asset.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";
import { serviceRequestRouter } from "./modules/serviceRequests/serviceRequest.routes.js";
import { serviceTypeRouter } from "./modules/serviceTypes/serviceType.routes.js";
import { technicianRouter } from "./modules/technicians/technician.routes.js";
import { workOrderRouter } from "./modules/workOrders/workOrder.routes.js";
import { visitRouter } from "./modules/visits/visit.routes.js";
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
  app.use(express.json());

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
}
