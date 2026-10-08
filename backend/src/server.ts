import "dotenv/config";
import { markOverdue } from "./modules/invoices/invoice.service.js";
import { runSweeps } from "./modules/notifications/notification.events.js";
import { startNotificationWorker } from "./lib/queue.js";
import { generateDue } from "./modules/maintenance/maintenance.service.js";
import { createApp } from "./app.js";

export { createApp };
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
