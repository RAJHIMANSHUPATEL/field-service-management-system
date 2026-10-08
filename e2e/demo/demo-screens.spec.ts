import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Walks the demo organization as each role and saves screenshots. Any console error, page error
// or failed API call fails the run.
const dir = process.env.DEMO_SCREENS_DIR ?? "/workspace/screens/demo";
const password = "Password123!";
mkdirSync(dir, { recursive: true });

async function signIn(browser: Browser, email: string, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  const page = await context.newPage();
  const problems: string[] = [];
  let watching = false;
  page.on("console", (message) => watching && message.type() === "error" && problems.push(`console: ${message.text()}`));
  page.on("pageerror", (error) => watching && problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (watching && response.url().includes("/api/") && response.status() >= 400) problems.push(`http ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => watching && problems.push(`failed ${request.url()} ${request.failure()?.errorText}`));
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  watching = true;
  return { page, problems, close: () => context.close() };
}

async function shot(page: Page, path: string, name: string, ready?: (page: Page) => Promise<void>, fullPage = false) {
  if (path) await page.goto(path);
  await page.waitForLoadState("networkidle");
  if (ready) await ready(page);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage });
}

test("ops and admin screens", async ({ browser }) => {
  const ops = await signIn(browser, "rohan.mehta@example.com");
  const { page } = ops;
  await shot(page, "/", "ops-dashboard", async (p) => {
    await expect(p.getByTestId("stat-active-jobs")).not.toHaveText("0");
    await expect(p.getByTestId("stat-pending-invoices")).not.toHaveText("0");
  });
  await shot(page, "/work-orders", "ops-work-orders", async (p) => expect(p.getByRole("row").nth(5)).toBeVisible());
  await shot(page, "/schedule", "ops-calendar-this-week", async (p) => expect(p.getByRole("link", { name: /Suresh Kumar|Vikram Patil|Manjunath Gowda/ }).first()).toBeVisible(), true);
  await shot(page, "/requests", "ops-requests");
  await shot(page, "/invoices", "ops-invoices", async (p) => expect(p.getByRole("row").nth(5)).toBeVisible());
  await page.getByRole("row", { name: /Partially paid|Overdue|Issued/ }).first().getByRole("link").click();
  await shot(page, "", "ops-invoice-detail", async (p) => expect(p.getByText(/CGST/i).first()).toBeVisible());
  await shot(page, "/analytics", "ops-technician-performance", async (p) => expect(p.getByRole("table").first()).toBeVisible());
  await shot(page, "/contracts", "ops-contracts");
  await shot(page, "/inventory", "ops-inventory");
  await shot(page, "/feedback", "ops-feedback");
  await shot(page, "/customers", "ops-customers");
  expect(ops.problems).toEqual([]);
  await ops.close();

  const admin = await signIn(browser, "meera.iyer@example.com");
  await shot(admin.page, "/", "admin-dashboard");
  await shot(admin.page, "/technicians", "admin-technicians");
  await shot(admin.page, "/audit", "admin-audit-log");
  expect(admin.problems).toEqual([]);
  await admin.close();
});

test("technician My jobs at 375px", async ({ browser }) => {
  const tech = await signIn(browser, "suresh.kumar@example.com", { width: 375, height: 812 });
  await shot(tech.page, "/my-jobs", "technician-my-jobs-375", async (p) => expect(p.getByText(/Greenwood|Sanjeevani|Rao|Iyer|Nimbus|Kaapi|Brightpath|Orchid|Vriksha|Reddy|Menon/).first()).toBeVisible(), true);
  expect(tech.problems).toEqual([]);
  await tech.close();
});

test("customer portal", async ({ browser }) => {
  const customer = await signIn(browser, "ananya.rao@example.com");
  await shot(customer.page, "/", "customer-portal-home");
  await shot(customer.page, "/requests", "customer-requests");
  await shot(customer.page, "/invoices", "customer-invoices");
  await shot(customer.page, "/equipment", "customer-equipment");
  expect(customer.problems).toEqual([]);
  await customer.close();
});
