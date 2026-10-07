import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./src/test/databaseUrl";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/test/globalSetup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: "test-access-secret-value",
      JWT_REFRESH_SECRET: "test-refresh-secret-value",
      CORS_ORIGIN: "http://localhost:5173",
    },
  },
});
