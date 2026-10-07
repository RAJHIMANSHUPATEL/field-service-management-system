import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type MailMessage = { to: string; subject: string; text: string; link?: string };

// Local providers only. MAIL_PROVIDER=log (default) prints the message, MAIL_PROVIDER=file also
// appends it as JSON to MAIL_OUTBOX_FILE. Tests read `sentMail`. To switch to a real provider, add a
// branch here (for example SMTP via nodemailer) selected by MAIL_PROVIDER; callers do not change.
export const sentMail: MailMessage[] = [];

export async function sendMail(message: MailMessage) {
  sentMail.push(message);
  const provider = process.env.MAIL_PROVIDER ?? "log";
  if (provider === "file") {
    const file = process.env.MAIL_OUTBOX_FILE ?? ".mail/outbox.jsonl";
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`);
  }
  if (process.env.NODE_ENV !== "test") {
    console.log(`[mail] to=${message.to} subject="${message.subject}"${message.link ? ` link=${message.link}` : ""}`);
  }
}

export function appUrl(path: string) {
  return `${process.env.APP_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173"}${path}`;
}
