import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";

// Credit notes and refunds on demo invoices: the invoice page with both lists, the two dialogs,
// and the invoice PDF (rendered to PNG separately with pdftoppm).
const dir = process.env.CREDITS_SCREENS_DIR ?? "/workspace/screens/credits";
const password = "Password123!";
const apiBase = "http://localhost:4000/api/v1";
mkdirSync(dir, { recursive: true });

type Detail = {
  id: string;
  number: string | null;
  status: string;
  customer: { name: string };
  creditNotes: unknown[];
  refunds: unknown[];
  settlement: { netPaid: string; balance: string; creditable: string; refundable: string };
};

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

test("credit notes and refunds on the invoice page, the dialogs and the PDF", async ({ browser, playwright }) => {
  const http = await playwright.request.newContext();
  const login = await http.post(`${apiBase}/auth/login`, { data: { email: "meera.iyer@example.com", password } });
  const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken as string}` };
  const details: Detail[] = [];
  for (let page = 1; ; page += 1) {
    const body = (await (await http.get(`${apiBase}/invoices?limit=100&page=${page}`, { headers })).json()) as { data: { id: string; status: string }[]; meta: { total: number } };
    for (const row of body.data.filter((item) => item.status !== "DRAFT")) {
      details.push((await (await http.get(`${apiBase}/invoices/${row.id}`, { headers })).json()).data as Detail);
    }
    if (page * 100 >= body.meta.total) break;
  }
  const both = details.find((row) => row.creditNotes.length > 0 && row.refunds.length > 0);
  const actionable = details.find((row) => Number(row.settlement.creditable) > 0 && Number(row.settlement.refundable) > 0 && row.status !== "PAID")
    ?? details.find((row) => Number(row.settlement.creditable) > 0 && Number(row.settlement.refundable) > 0);
  expect(both, "a demo invoice with a credit note and a refund").toBeTruthy();
  expect(actionable, "a demo invoice that can be credited and refunded").toBeTruthy();
  const pdf = await http.get(`${apiBase}/invoices/${both!.id}/pdf`, { headers });
  expect(pdf.status()).toBe(200);
  writeFileSync(`${dir}/invoice-${both!.number}.pdf`, await pdf.body());
  await http.dispose();

  const admin = await signIn(browser, "meera.iyer@example.com");
  await admin.page.goto(`/invoices/${both!.id}`);
  await expect(admin.page.getByRole("region", { name: "Credit notes" })).toBeVisible();
  await expect(admin.page.getByRole("region", { name: "Refunds" })).toBeVisible();
  await admin.page.screenshot({ path: `${dir}/invoice-with-credits-and-refunds.png`, fullPage: true });

  await admin.page.goto(`/invoices/${actionable!.id}`);
  await expect(admin.page.getByTestId("invoice-creditable")).toBeVisible();
  await admin.page.screenshot({ path: `${dir}/invoice-actions.png`, fullPage: true });
  await admin.page.getByRole("button", { name: "Issue credit note" }).click();
  const credit = admin.page.getByRole("dialog", { name: "Issue credit note" });
  await expect(credit.getByTestId("credit-limit")).toContainText("Creditable");
  await credit.getByLabel("Reason").fill("Goodwill for the delayed visit");
  await admin.page.screenshot({ path: `${dir}/dialog-credit-note.png` });
  // Over the limit: the form says so before anything is sent.
  await credit.getByLabel("Amount").fill(String(Number(actionable!.settlement.creditable) + 1));
  await credit.getByRole("button", { name: "Issue credit note" }).click();
  await expect(credit.getByText(/^At most/)).toBeVisible();
  await admin.page.screenshot({ path: `${dir}/dialog-credit-note-over-limit.png` });
  await credit.getByRole("button", { name: "Cancel" }).click();
  await expect(credit).toBeHidden();

  await admin.page.getByRole("button", { name: "Refund", exact: true }).click();
  const refund = admin.page.getByRole("dialog", { name: "Refund" });
  await expect(refund.getByTestId("refund-limit")).toContainText("Refundable");
  await refund.getByLabel("Amount").fill("100.00");
  await refund.getByLabel("Reason").fill("Customer paid twice at the counter");
  await admin.page.screenshot({ path: `${dir}/dialog-refund.png` });
  await refund.getByRole("button", { name: "Cancel" }).click();
  expect(admin.problems).toEqual([]);
  await admin.close();

  console.log(`both: ${both!.number} ${both!.customer.name}; actionable: ${actionable!.number} ${actionable!.customer.name} (${actionable!.status})`);
});
