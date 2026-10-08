import { defineConfig, devices } from "@playwright/test";

// Screenshots of the demo dataset (run `npm run db:seed:demo` in backend first). Not part of the
// regular e2e suite: `npx playwright test -c demo.config.ts`. Reuses running dev servers.
export default defineConfig({
  testDir: "./demo",
  timeout: 180_000,
  workers: 1,
  use: { baseURL: "http://localhost:5173", timezoneId: "Asia/Kolkata", locale: "en-IN", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "npm run dev", cwd: "../backend", url: "http://localhost:4000/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "npm run dev -- --port 5173 --strictPort", cwd: "../frontend", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  ],
});
