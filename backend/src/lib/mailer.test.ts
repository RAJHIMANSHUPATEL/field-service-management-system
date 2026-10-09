import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAIL_FROM, sendMail, sentMail, setMailTransportFactory, smtpSettings, type MailTransport, type SmtpSettings } from "./mailer.js";

const smtpEnv = { MAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "mailer@example.com", SMTP_PASS: "not-a-real-password" };
const keys = [...Object.keys(smtpEnv), "MAIL_FROM", "SMTP_SECURE"];
let saved: Record<string, string | undefined> = {};

// A fake transport: records what it is given, never opens a connection.
function fakeTransport(behaviour: () => Promise<unknown> = async () => ({ messageId: "fake" })) {
  const created: SmtpSettings[] = [];
  const handed: Parameters<MailTransport["sendMail"]>[0][] = [];
  setMailTransportFactory((settings) => {
    created.push(settings);
    return { sendMail: async (mail) => (handed.push(mail), behaviour()) };
  });
  return { created, handed };
}

beforeEach(() => {
  saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, smtpEnv);
  delete process.env.MAIL_FROM;
  delete process.env.SMTP_SECURE;
  sentMail.length = 0;
});

afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  setMailTransportFactory(null);
  vi.restoreAllMocks();
});

describe("mailer: SMTP provider", () => {
  it("hands the message to the SMTP transport, created once and reused", async () => {
    const fake = fakeTransport();
    await sendMail({ to: "owner@example.com", subject: "Reset your password", text: "Reset your password: https://app.example.com/r/1", link: "https://app.example.com/r/1" });
    await sendMail({ to: "ops@example.com", subject: "Job completed", text: "Job 42 is done.", link: "https://app.example.com/work-orders/42" });
    expect(fake.created).toEqual([{ host: "smtp.example.com", port: 587, secure: false, auth: { user: "mailer@example.com", pass: "not-a-real-password" } }]);
    expect(fake.handed).toEqual([
      { from: DEFAULT_MAIL_FROM, to: "owner@example.com", subject: "Reset your password", text: "Reset your password: https://app.example.com/r/1" },
      // A link not already in the text is appended.
      { from: DEFAULT_MAIL_FROM, to: "ops@example.com", subject: "Job completed", text: "Job 42 is done.\n\nhttps://app.example.com/work-orders/42" },
    ]);
    expect(sentMail.map((mail) => mail.to)).toEqual(["owner@example.com", "ops@example.com"]);

    process.env.MAIL_FROM = "Kaveri Facility Services <billing@example.com>";
    await sendMail({ to: "owner@example.com", subject: "Invoice", text: "Your invoice" });
    expect(fake.handed[2]!.from).toBe("Kaveri Facility Services <billing@example.com>");
    expect(fake.created).toHaveLength(1);
  });

  it("reads the port as a number and uses TLS on 465 unless SMTP_SECURE says otherwise", () => {
    expect(smtpSettings({ ...smtpEnv, SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true });
    expect(smtpSettings({ ...smtpEnv, SMTP_PORT: "2525", SMTP_SECURE: "true" })).toMatchObject({ port: 2525, secure: true });
    expect(smtpSettings({ ...smtpEnv, SMTP_PORT: "465", SMTP_SECURE: "false" })).toMatchObject({ secure: false });
    expect(smtpSettings({ ...smtpEnv, SMTP_PORT: "smtp" })).toEqual({ missing: ["SMTP_PORT (not a port number)"] });
    expect(smtpSettings({ MAIL_PROVIDER: "smtp", SMTP_PORT: "587" })).toEqual({ missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] });
  });

  it("falls back to logging when SMTP settings are missing, warning once without the password", async () => {
    const fake = fakeTransport();
    delete process.env.SMTP_HOST;
    process.env.SMTP_USER = "  ";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "development"); // the log line is silenced under NODE_ENV=test
    try {
      await expect(sendMail({ to: "owner@example.com", subject: "Welcome", text: "Hello" })).resolves.toBeUndefined();
      await sendMail({ to: "ops@example.com", subject: "Second", text: "Again", link: "http://localhost:5173/x" });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(fake.created).toEqual([]);
    expect(fake.handed).toEqual([]);
    expect(sentMail.map((mail) => mail.subject)).toEqual(["Welcome", "Second"]);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      '[mail] to=owner@example.com subject="Welcome"',
      '[mail] to=ops@example.com subject="Second" link=http://localhost:5173/x',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    const warning = String(warn.mock.calls[0]![0]);
    expect(warning).toContain("SMTP_HOST, SMTP_USER");
    expect(warning).not.toContain("not-a-real-password");
  });

  it("rethrows a failed SMTP send and does not record it as sent", async () => {
    fakeTransport(async () => {
      throw new Error("421 Service not available");
    });
    await expect(sendMail({ to: "owner@example.com", subject: "Welcome", text: "Hello" })).rejects.toThrow("421 Service not available");
    expect(sentMail).toEqual([]);
  });

  it("leaves the log and file providers as they were", async () => {
    const fake = fakeTransport();
    process.env.MAIL_PROVIDER = "log";
    await sendMail({ to: "owner@example.com", subject: "Log", text: "Hello" });
    expect(fake.created).toEqual([]);
    expect(sentMail.map((mail) => mail.subject)).toEqual(["Log"]);
  });
});
