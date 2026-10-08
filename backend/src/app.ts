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
import { mounts } from "./routes/mounts.js";
import "./types/authUser.js";

// The Express app without a listener or timers, so scripts (tests, the demo seed) can run it in-process.
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
