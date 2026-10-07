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
