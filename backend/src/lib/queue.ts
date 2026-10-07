import { Queue, Worker, type Job } from "bullmq";

// Background jobs on BullMQ + Redis. NOTIFICATION_QUEUE=inline runs jobs in-process instead
// (used by tests so they need no worker); the retry policy is the same in both modes.
export const MAX_ATTEMPTS = 5;
const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

type Handler = (id: string, attempt: number) => Promise<void>;

let queue: Queue | null = null;
let handler: Handler | null = null;
const pending = new Set<Promise<void>>();

function inline() {
  return (process.env.NOTIFICATION_QUEUE ?? (process.env.NODE_ENV === "test" ? "inline" : "bullmq")) === "inline";
}

export function registerNotificationHandler(next: Handler) {
  handler = next;
}

async function runInline(id: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await handler!(id, attempt);
      return;
    } catch {
      // The handler records the failure on the delivery; the next attempt follows immediately.
    }
  }
}

export function enqueueNotification(id: string) {
  if (inline()) {
    const run = new Promise<void>((resolve) => setImmediate(resolve)).then(() => runInline(id));
    pending.add(run);
    void run.finally(() => pending.delete(run));
    return;
  }
  queue ??= new Queue("notifications", { connection });
  void queue
    .add("deliver", { id }, { attempts: MAX_ATTEMPTS, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: 1_000 })
    .catch((error: unknown) => console.error("Could not enqueue notification", id, error));
}

// Tests call this to wait for in-process deliveries.
export async function drainNotifications() {
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }
}

export function startNotificationWorker() {
  if (inline()) {
    return null;
  }
  return new Worker(
    "notifications",
    async (job: Job<{ id: string }>) => handler!(job.data.id, job.attemptsMade + 1),
    { connection, concurrency: 5 },
  );
}
