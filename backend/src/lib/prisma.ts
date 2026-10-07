import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// #region agent log
{
  const parsed = new URL(connectionString);
  fetch("http://127.0.0.1:7863/ingest/c073d103-8592-493c-b7ab-4f798c5dd065", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "93e68e" },
    body: JSON.stringify({
      sessionId: "93e68e",
      runId: "pre-fix",
      hypothesisId: "A-B-C-E",
      location: "prisma.ts:connection",
      message: "Parsed DATABASE_URL target",
      data: {
        user: decodeURIComponent(parsed.username),
        host: parsed.hostname,
        port: parsed.port,
        database: parsed.pathname.replace(/^\//, ""),
        passwordLength: decodeURIComponent(parsed.password).length,
        passwordIsPlaceholder: decodeURIComponent(parsed.password) === "postgres",
        passwordContainsPercentEncoding: parsed.password.includes("%"),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
