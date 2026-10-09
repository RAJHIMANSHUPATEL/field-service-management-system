import { mkdirSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";

// Customer online pay on a demo invoice (demo screenshots, not in CI). Run once against a backend
// with the default mock provider (no Pay button) and once with PAYMENT_PROVIDER=razorpay (Pay shown;
// no gateway exists, so it is never clicked). The office Record payment form is captured too.
const dir = process.env.ONLINE_PAY_SCREENS_DIR ?? "/workspace/screens/online-pay";
const password = "Password123!";
const apiBase = "http://localhost:4000/api/v1";
mkdirSync(dir, { recursive: true });

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  const page = await context.newPage();
  const problems: string[] = [];
  let watching = false;
  page.on("console", (message) => watching && message.type() === "error" && problems.push(`console: ${message.text()}`));
  page.on("pageerror", (error) => watching && problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (watching && response.url().includes("/api/") && response.status() >= 400) problems.push(`http ${response.status()} ${response.url()}`);
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  watching = true;
  return { page, problems, close: () => context.close() };
}

test("customer invoice page with and without online pay", async ({ browser, playwright }) => {
  const http = await playwright.request.newContext();
  const login = await http.post(`${apiBase}/auth/login`, { data: { email: "meera.iyer@example.com", password } });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken as string}` };
  const { onlinePay } = (await (await http.get(`${apiBase}/invoices/payment-options`, { headers })).json()).data as { onlinePay: boolean };
  const issued = (await (await http.get(`${apiBase}/invoices?status=ISSUED&limit=100`, { headers })).json()).data as { id: string; customer: { id: string } }[];
  expect(issued.length, "an issued demo invoice").toBeGreaterThan(0);
  const invoice = issued[0]!;
  const customer = (await (await http.get(`${apiBase}/customers/${invoice.customer.id}`, { headers })).json()).data as { contacts: { email: string; hasLogin: boolean }[] };
  const email = customer.contacts.find((contact) => contact.hasLogin)!.email;
  await http.dispose();

  const session = await signIn(browser, email);
  const options = session.page.waitForResponse((r) => r.url().endsWith("/invoices/payment-options"));
  await session.page.goto(`/invoices/${invoice.id}`);
  expect((await (await options).json()).data).toEqual({ onlinePay });
  await expect(session.page.getByText("Issued", { exact: true }).first()).toBeVisible();
  if (onlinePay) {
    await expect(session.page.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
    await expect(session.page.getByTestId("invoice-pay-offline")).toHaveCount(0);
  } else {
    await expect(session.page.getByTestId("invoice-pay-offline")).toBeVisible();
    await expect(session.page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  }
  await session.page.screenshot({ path: `${dir}/customer-invoice-${onlinePay ? "real-provider" : "mock"}.png`, fullPage: true });
  expect(session.problems).toEqual([]);
  await session.close();

  const ops = await signIn(browser, "meera.iyer@example.com");
  await ops.page.goto(`/invoices/${invoice.id}`);
  await expect(ops.page.getByRole("button", { name: "Record payment" })).toBeVisible();
  await expect(ops.page.getByRole("button", { name: /^Pay ₹/ })).toHaveCount(0);
  await ops.page.getByText("Record payment").first().scrollIntoViewIfNeeded();
  await ops.page.screenshot({ path: `${dir}/ops-invoice-record-payment.png`, fullPage: true });
  expect(ops.problems).toEqual([]);
  await ops.close();
});
