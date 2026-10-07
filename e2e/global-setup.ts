import { execSync } from "node:child_process";

// Bring the development database up to date and seed it before the servers start.
export default function globalSetup() {
  execSync("npm run db:migrate && npm run db:seed", { cwd: "../backend", stdio: "inherit" });
}
