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
