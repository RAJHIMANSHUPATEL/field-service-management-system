import { mkdirSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";

// The Download PDF button on the invoice page: shown for issued, partly paid, paid, overdue and void
// invoices, hidden on drafts, and downloading through the signed-in API client.
const dir = process.env.INVOICE_PDF_SCREENS_DIR ?? "/workspace/screens/invoice-pdf";
const password = "Password123!";
const apiBase = "http://localhost:4000/api/v1";
mkdirSync(dir, { recursive: true });

type Row = { id: string; number: string | null; status: string; amountPaid: string; igst: string; customer: { name: string } };

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Kolkata", locale: "en-IN", acceptDownloads: true });
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

async function invoices(playwright: typeof import("@playwright/test"), email: string) {
  const http = await playwright.request.newContext();
  const login = await http.post(`${apiBase}/auth/login`, { data: { email, password } });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken as string}` };
  const rows: Row[] = [];
  for (let page = 1; ; page += 1) {
    const body = (await (await http.get(`${apiBase}/invoices?limit=100&page=${page}`, { headers })).json()) as { data: Row[]; meta: { total: number } };
    rows.push(...body.data);
    if (rows.length >= body.meta.total || body.data.length === 0) break;
  }
  await http.dispose();
  return rows;
}

test("download the invoice PDF from the invoice page", async ({ browser, playwright }) => {
  const office = await invoices(playwright, "rohan.mehta@example.com");
  const partial = office.find((row) => row.status === "ISSUED" && Number(row.amountPaid) > 0 && Number(row.igst) > 0);
  const draft = office.find((row) => row.status === "DRAFT");
  expect(partial, "a partly paid inter-state invoice").toBeTruthy();
  expect(draft, "a draft invoice").toBeTruthy();

  const ops = await signIn(browser, "rohan.mehta@example.com");
  await ops.page.goto(`/invoices/${partial!.id}`);
  const button = ops.page.getByRole("button", { name: "Download PDF" });
  await expect(button).toBeVisible();
  await ops.page.screenshot({ path: `${dir}/button-ops-partially-paid.png`, fullPage: true });
  const [download] = await Promise.all([ops.page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe(`invoice-${partial!.number}.pdf`);
  await download.saveAs(`${dir}/downloaded-ops-${partial!.number}.pdf`);

  await ops.page.goto(`/invoices/${draft!.id}`);
  await expect(ops.page.getByRole("button", { name: "Issue" })).toBeVisible();
  await expect(ops.page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  await ops.page.screenshot({ path: `${dir}/no-button-draft.png`, fullPage: true });
  expect(ops.problems).toEqual([]);
  await ops.close();

  const own = (await invoices(playwright, "ananya.rao@example.com")).find((row) => row.status === "PAID");
  expect(own, "a paid invoice of the customer").toBeTruthy();
  const customer = await signIn(browser, "ananya.rao@example.com");
  await customer.page.goto(`/invoices/${own!.id}`);
  const mine = customer.page.getByRole("button", { name: "Download PDF" });
  await expect(mine).toBeVisible();
  await customer.page.screenshot({ path: `${dir}/button-customer-paid.png`, fullPage: true });
  const [customerDownload] = await Promise.all([customer.page.waitForEvent("download"), mine.click()]);
  expect(customerDownload.suggestedFilename()).toBe(`invoice-${own!.number}.pdf`);
  await customerDownload.saveAs(`${dir}/downloaded-customer-${own!.number}.pdf`);
  expect(customer.problems).toEqual([]);
  await customer.close();

  console.log(`ops: ${partial!.number} ${partial!.customer.name}; draft: ${draft!.id}; customer: ${own!.number} ${own!.customer.name}`);
});
