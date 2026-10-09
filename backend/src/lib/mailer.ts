import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; link?: string };

// MAIL_PROVIDER picks the provider; callers only call sendMail.
// - log (default): prints the message.
// - file: also appends it as JSON to MAIL_OUTBOX_FILE.
// - smtp: sends it through nodemailer with SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS. If any of
//   them is missing, it logs like the log provider (and warns once) instead of failing. A failed send
//   throws, so the notification worker retries it.
// Tests read `sentMail` and keep the log provider.
export const sentMail: MailMessage[] = [];

export const DEFAULT_MAIL_FROM = "FieldOps <no-reply@example.com>";

// The part of a nodemailer transporter the mailer uses, so tests can hand in a fake one.
export type MailTransport = { sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown> };
export type SmtpSettings = { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };
type TransportFactory = (settings: SmtpSettings) => MailTransport;

const defaultFactory: TransportFactory = (settings) => nodemailer.createTransport(settings);
let factory: TransportFactory = defaultFactory;
let transport: { key: string; value: MailTransport } | null = null;
let warned = false;

// Test hook: replace how the SMTP transport is created (null restores nodemailer), and forget the
// cached transport and the one-time warning.
export function setMailTransportFactory(next: TransportFactory | null) {
  factory = next ?? defaultFactory;
  transport = null;
  warned = false;
}

const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;

// The SMTP settings from the environment, or the names of the missing variables. SMTP_PORT must be
// a port number. TLS from the first byte (secure) on port 465 unless SMTP_SECURE says otherwise;
// other ports upgrade with STARTTLS when the server offers it.
export function smtpSettings(env: NodeJS.ProcessEnv = process.env): SmtpSettings | { missing: string[] } {
  const missing: string[] = required.filter((name) => !env[name]?.trim());
  const port = Number(env.SMTP_PORT);
  if (env.SMTP_PORT?.trim() && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    missing.push("SMTP_PORT (not a port number)");
  }
  if (missing.length > 0) {
    return { missing: [...new Set(missing)] };
  }
  const secureFlag = env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureFlag === "true" ? true : secureFlag === "false" ? false : port === 465;
  return { host: env.SMTP_HOST!.trim(), port, secure, auth: { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASS! } };
}

// Created on first use and reused; rebuilt only if the settings change.
function smtpTransport(settings: SmtpSettings) {
  const key = JSON.stringify([settings.host, settings.port, settings.secure, settings.auth.user, settings.auth.pass]);
  if (transport?.key !== key) {
    transport = { key, value: factory(settings) };
  }
  return transport.value;
}

function logLine(message: MailMessage) {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[mail] to=${message.to} subject="${message.subject}"${message.link ? ` link=${message.link}` : ""}`);
  }
}

export async function sendMail(message: MailMessage) {
  const provider = process.env.MAIL_PROVIDER ?? "log";
  if (provider !== "smtp") {
    sentMail.push(message);
  }
  if (provider === "smtp") {
    const settings = smtpSettings();
    if ("missing" in settings) {
      if (!warned) {
        warned = true;
        // Names only: never the values (SMTP_PASS above all).
        console.warn(`[mail] MAIL_PROVIDER=smtp but ${settings.missing.join(", ")} is not set; logging messages instead of sending them`);
      }
      sentMail.push(message);
      logLine(message);
      return;
    }
    const text = message.link && !message.text.includes(message.link) ? `${message.text}\n\n${message.link}` : message.text;
    // Errors propagate: the notification worker records them and retries.
    await smtpTransport(settings).sendMail({ from: process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM, to: message.to, subject: message.subject, text });
    // Recorded once the SMTP server has accepted it, like the SMS provider.
    sentMail.push(message);
    return;
  }
  if (provider === "file") {
    const file = process.env.MAIL_OUTBOX_FILE ?? ".mail/outbox.jsonl";
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`);
  }
  logLine(message);
}

export function appUrl(path: string) {
  return `${process.env.APP_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173"}${path}`;
}
