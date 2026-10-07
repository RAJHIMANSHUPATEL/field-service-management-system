import type { NextFunction, Request, Response } from "express";
import { Redis } from "ioredis";
import { AppError } from "../lib/errors.js";

// Fixed-window rate limits. Counters live in Redis so every API process shares them;
// RATE_LIMIT_STORE=memory keeps them in-process (tests, single process without Redis).
type Store = { hit(key: string, windowMs: number): Promise<number> };

const memory = new Map<string, { count: number; resetAt: number }>();
const memoryStore: Store = {
  async hit(key, windowMs) {
    const now = Date.now();
    const entry = memory.get(key);
    if (!entry || entry.resetAt <= now) {
      memory.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  },
};

let redis: Redis | null = null;
const redisStore: Store = {
  async hit(key, windowMs) {
    redis ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: 1, lazyConnect: false });
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return count;
  },
};

function store(): Store {
  const kind = process.env.RATE_LIMIT_STORE ?? (process.env.NODE_ENV === "test" ? "memory" : "redis");
  return kind === "memory" ? memoryStore : redisStore;
}

export function rateLimit(options: { name: string; limit: number; windowMs: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.limit <= 0) {
      next();
      return;
    }
    const window = Math.floor(Date.now() / options.windowMs);
    const subject = options.key ? options.key(req) : (req.ip ?? "unknown");
    try {
      const count = await store().hit(`rl:${options.name}:${subject}:${window}`, options.windowMs);
      res.setHeader("RateLimit-Limit", String(options.limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(options.limit - count, 0)));
      if (count > options.limit) {
        const retryAfter = Math.ceil(((window + 1) * options.windowMs - Date.now()) / 1000);
        res.setHeader("Retry-After", String(retryAfter));
        next(new AppError("RATE_LIMITED", 429, "Too many requests; try again shortly", { retryAfterSeconds: retryAfter }));
        return;
      }
    } catch (error) {
      // If Redis is down the API keeps serving; the outage is logged, not hidden.
      console.error("[rate-limit] store unavailable", error);
    }
    next();
  };
}

const number = (name: string, fallback: number) => {
  const value = process.env[name];
  return value === undefined ? fallback : Number(value);
};

// Defaults: 10 sign-in attempts per minute per address and email, 600 API calls per minute per
// address. Tests turn the general limit off unless they set it.
export function authLimiter() {
  return rateLimit({
    name: "auth",
    limit: number("RATE_LIMIT_AUTH", process.env.NODE_ENV === "test" ? 0 : 10),
    windowMs: 60_000,
    key: (req) => `${req.ip}:${String((req.body as { email?: string } | undefined)?.email ?? "").toLowerCase()}`,
  });
}

export function apiLimiter() {
  return rateLimit({ name: "api", limit: number("RATE_LIMIT_API", process.env.NODE_ENV === "test" ? 0 : 600), windowMs: 60_000 });
}
