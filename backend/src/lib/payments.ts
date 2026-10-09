import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";

// Online payment provider. Only the local mock exists: it approves every charge and returns a
// reference. To switch, implement charge() for a real gateway and set PAYMENT_PROVIDER.
export type Charge = { invoiceId: string; amount: string; currency: string };

export async function charge(input: Charge) {
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";
  if (provider !== "mock") {
    throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", 503, `Payment provider "${provider}" is not configured`);
  }
  return { provider: "mock", reference: `mock_${randomUUID()}`, amount: input.amount };
}

// Gateways that count as a real provider for customer online pay. None is implemented yet, so with
// one of these names online pay is offered but charge() still answers 503
// PAYMENT_PROVIDER_UNAVAILABLE until its branch is written. Any other name (a typo, "mock", empty or
// unset) keeps online pay off.
export const REAL_PAYMENT_PROVIDERS = ["razorpay", "stripe"] as const;

let mockOnlinePay = false;

// Replaying history only: the demo seed lets its customers pay online through the mock, so its
// dataset keeps the online payments it always had. Nothing in the API or the environment turns this
// on; only in-process code (the seed, tests) can.
export function allowMockOnlinePay(allowed: boolean) {
  mockOnlinePay = allowed;
}

// Whether customers may pay online: only with a real provider configured (or the replay switch above).
export function onlinePayEnabled(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.PAYMENT_PROVIDER?.trim().toLowerCase() ?? "";
  return (REAL_PAYMENT_PROVIDERS as readonly string[]).includes(provider) || mockOnlinePay;
}
