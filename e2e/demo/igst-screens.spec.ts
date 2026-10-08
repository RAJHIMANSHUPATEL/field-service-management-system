import { mkdirSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";

// An intra-state (Bengaluru, CGST + SGST) and an inter-state (IGST) invoice from the demo
// organisation, plus the Company card where an admin sets the GST state.
const dir = process.env.IGST_SCREENS_DIR ?? "/workspace/screens/igst";
const password = "Password123!";
const apiBase = "http://localhost:4000/api/v1";
mkdirSync(dir, { recursive: true });

type Detail = { id: string; number: string | null; status: string; cgst: string; sgst: string; igst: string; customer: { name: string } };

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

test("intra-state and inter-state invoices, and the GST state setting", async ({ browser, playwright }) => {
  const http = await playwright.request.newContext();
  const login = await http.post(`${apiBase}/auth/login`, { data: { email: "rohan.mehta@example.com", password } });
  const token = (await login.json()).data.accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  const list = (await (await http.get(`${apiBase}/invoices?limit=100&status=ISSUED`, { headers })).json()).data as { id: string }[];
  const details: Detail[] = [];
  for (const row of list) {
    details.push((await (await http.get(`${apiBase}/invoices/${row.id}`, { headers })).json()).data as Detail);
  }
  const intra = details.find((invoice) => Number(invoice.cgst) > 0);
  const inter = details.find((invoice) => Number(invoice.igst) > 0);
  expect(intra, "an issued intra-state invoice").toBeTruthy();
  expect(inter, "an issued inter-state invoice").toBeTruthy();
  await http.dispose();

  const ops = await signIn(browser, "rohan.mehta@example.com");
  await ops.page.goto(`/invoices/${intra!.id}`);
  await expect(ops.page.getByTestId("invoice-cgst")).toBeVisible();
  await expect(ops.page.getByTestId("invoice-sgst")).toBeVisible();
  await expect(ops.page.getByTestId("invoice-igst")).toHaveCount(0);
  await ops.page.screenshot({ path: `${dir}/invoice-intra-state-cgst-sgst.png`, fullPage: true });

  await ops.page.goto(`/invoices/${inter!.id}`);
  await expect(ops.page.getByTestId("invoice-igst")).toBeVisible();
  await expect(ops.page.getByTestId("invoice-cgst")).toHaveCount(0);
  await expect(ops.page.getByTestId("invoice-sgst")).toHaveCount(0);
  await ops.page.screenshot({ path: `${dir}/invoice-inter-state-igst.png`, fullPage: true });
  expect(ops.problems).toEqual([]);
  await ops.close();

  const admin = await signIn(browser, "meera.iyer@example.com");
  await admin.page.goto("/master");
  await expect(admin.page.getByLabel("GST state")).toHaveValue("29");
  await admin.page.screenshot({ path: `${dir}/admin-company-gst-state.png` });
  expect(admin.problems).toEqual([]);
  await admin.close();

  console.log(`intra: ${intra!.number} ${intra!.customer.name}; inter: ${inter!.number} ${inter!.customer.name}`);
});
