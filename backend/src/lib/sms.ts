import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Local SMS provider only. SMS_PROVIDER=log (default) prints, SMS_PROVIDER=file appends JSON to
// SMS_OUTBOX_FILE, SMS_PROVIDER=fail always throws (to exercise retries). Add a branch for a
// real gateway; callers do not change.
export const sentSms: { to: string; text: string }[] = [];

export async function sendSms(message: { to: string; text: string }) {
  const provider = process.env.SMS_PROVIDER ?? "log";
  if (provider === "fail") {
    throw new Error("SMS provider unavailable");
  }
  sentSms.push(message);
  if (provider === "file") {
    const file = process.env.SMS_OUTBOX_FILE ?? ".mail/sms.jsonl";
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`);
  }
  if (process.env.NODE_ENV !== "test") {
    console.log(`[sms] to=${message.to} "${message.text}"`);
  }
}
