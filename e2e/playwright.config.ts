import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export const outbox = resolve(import.meta.dirname, "test-results/outbox.jsonl");

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      env: { MAIL_PROVIDER: "file", MAIL_OUTBOX_FILE: outbox },
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      cwd: "../frontend",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
