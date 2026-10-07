import { expect, type Browser, type Page } from "@playwright/test";

export const password = "Password123!";
export const screensDir = process.env.SCREENS_DIR ?? "/workspace/screens";

export async function signIn(browser: Browser, email: string, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems: string[] = [];
  // Before sign-in the app probes the session and gets an expected 401; only watch after sign-in.
  let watching = false;
  page.on("console", (message) => {
    if (watching && message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => watching && problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (watching && response.url().includes("/api/") && response.status() >= 400) {
      problems.push(`http ${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  watching = true;
  return { page, problems, close: () => context.close() };
}

export async function dialogSubmit(page: Page, name: string | RegExp) {
  await page.getByRole("dialog").getByRole("button", { name }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

export async function lastMailLink(to: string) {
  const { readFile } = await import("node:fs/promises");
  const { outbox } = await import("../playwright.config");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const lines = (await readFile(outbox, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
    const match = lines
      .map((line) => JSON.parse(line) as { to: string; link?: string })
      .reverse()
      .find((mail) => mail.to === to && mail.link);
    if (match?.link) {
      return new URL(match.link).pathname + new URL(match.link).search;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No mail for ${to}`);
}

// A unique future slot per run so repeated runs never double-book the seeded technician.
// Each spec passes its own base year so specs never collide with each other either.
export function slot(extraHours = 0, baseYear = 2027) {
  const hours = (Math.floor(Date.now() / 60_000) % 50_000) * 3 + extraHours;
  const date = new Date(Date.UTC(baseYear, 0, 1, 6) + hours * 3_600_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return { date, local };
}

// Calls the API directly as a seeded user, for arranging state a spec is not about.
export async function apiAs(email: string) {
  const login = await fetch("http://localhost:4000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  return async function call<T = { data: Record<string, unknown> }>(method: string, path: string, body?: unknown) {
    const response = await fetch(`http://localhost:4000/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  };
}
