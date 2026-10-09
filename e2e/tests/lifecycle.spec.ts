import { expect, test } from "@playwright/test";
import { apiAs, slot, dialogSubmit, screensDir, signIn } from "./helpers";

const phone = { width: 375, height: 812 };
// 1x1 PNG used as the visit photo.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);


test("request, triage, assign, schedule, accept, visit, complete, invoice, pay", async ({ browser }) => {
  const description = `Lifecycle ${Date.now()}`;

  // Customer reports a problem.
  const customer = await signIn(browser, "customer@fieldservice.local");
  await customer.page.goto("/requests");
  await customer.page.getByRole("button", { name: "New request" }).click();
  await customer.page.getByLabel("Equipment").selectOption({ label: "Water heater · WH-2001" });
  await customer.page.getByLabel("Service type").selectOption({ index: 1 });
  await customer.page.getByLabel("What is wrong").fill(description);
  await customer.page.getByLabel("Preferred start").fill("2026-11-02");
  await customer.page.getByLabel("Preferred end").fill("2026-11-04");
  const created = customer.page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/service-requests") && r.request().method() === "POST",
  );
  await dialogSubmit(customer.page, "Submit request");
  const requestId = ((await (await created).json()) as { data: { id: string } }).data.id;
  await customer.page.goto(`/requests/${requestId}`);
  await customer.page.getByLabel("Add photos or files").setInputFiles({
    name: "unit.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
      "hex",
    ),
  });
  await expect(customer.page.getByRole("button", { name: "unit.png" })).toBeVisible();

  // Ops triages it into a work order.
  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto(`/requests/${requestId}`);
  const popup = ops.page.waitForEvent("popup");
  await ops.page.getByRole("button", { name: "unit.png" }).click();
  expect((await (await popup).waitForLoadState().then(() => popup)).url()).toContain("unit.png");
  await ops.page.getByRole("button", { name: "Accept", exact: true }).click();
  await ops.page.getByRole("dialog").getByLabel("Priority").selectOption("HIGH");
  await ops.page.getByRole("dialog").getByLabel("Service type").selectOption({ index: 0 });
  await dialogSubmit(ops.page, "Accept");
  await ops.page.getByText("View work order").click();
  await expect(ops.page).toHaveURL(/\/work-orders\//);
  const workOrderUrl = new URL(ops.page.url()).pathname;

  // Ops assigns and schedules.
  await ops.page.getByRole("button", { name: "Assign" }).click();
  await expect(ops.page.getByRole("list", { name: "Suggested technicians" })).toContainText("Tara Technician");
  await ops.page.getByRole("dialog").getByLabel("Technician", { exact: true }).selectOption({ label: "Tara Technician" });
  await dialogSubmit(ops.page, "Assign");
  await ops.page.getByRole("button", { name: "Schedule" }).click();
  const first = slot();
  const moved = slot(1);
  await ops.page.getByLabel("Date and time").fill(first.local);
  await dialogSubmit(ops.page, "Schedule");
  await expect(ops.page.getByText("Scheduled", { exact: true })).toBeVisible();

  // Ops reschedules with a reason; the history shows both steps.
  await ops.page.getByRole("button", { name: "Reschedule" }).click();
  await ops.page.getByRole("dialog").getByLabel("New date and time").fill(moved.local);
  await ops.page.getByRole("dialog").getByLabel("Reason").fill("Customer asked for later");
  await dialogSubmit(ops.page, "Reschedule");
  const history = ops.page.getByRole("list", { name: "Visit history" });
  await expect(history.getByText(/^Scheduled for/)).toBeVisible();
  await expect(history.getByText(/^Moved from/)).toBeVisible();
  await expect(history.getByText(/Customer asked for later/)).toBeVisible();
  await ops.page.screenshot({ path: `${screensDir}/ops-visit-history.png`, fullPage: true });

  // The visit shows on the scheduling calendar for that week.
  await ops.page.goto("/schedule");
  await ops.page.getByLabel("Go to week").fill(moved.local.slice(0, 10));
  await expect(ops.page.getByRole("link", { name: /Tara Technician/ }).first()).toBeVisible();
  await ops.page.goto(workOrderUrl);
  // Wait for the page's data: leaving while its session refresh is in flight drops the rotated
  // refresh cookie, and the next load is then rejected as token reuse (seen on CI runners).
  await expect(ops.page.getByRole("list", { name: "Visit history" })).toBeVisible();

  // Ops stocks Tara's van from the main store.
  await ops.page.goto("/inventory");
  async function stockAction(button: string, fields: Record<string, string>, selects: Record<string, string>) {
    await ops.page.getByRole("button", { name: button }).click();
    const dialog = ops.page.getByRole("dialog");
    for (const [label, option] of Object.entries(selects)) {
      await dialog.getByLabel(label, { exact: true }).selectOption({ label: option });
    }
    for (const [label, value] of Object.entries(fields)) {
      await dialog.getByLabel(label, { exact: true }).fill(value);
    }
    await dialogSubmit(ops.page, "Save");
  }
  await stockAction("Receive stock", { Quantity: "5", Reason: "PO e2e" }, { Part: "FLT-STD · Air filter", Location: "Main store" });
  await stockAction(
    "Transfer stock",
    { Quantity: "2", Reason: "Van restock" },
    { Part: "FLT-STD · Air filter", From: "Main store", To: "Tara's van" },
  );
  const vanRow = ops.page.getByRole("table", { name: "Stock levels" }).getByRole("row").filter({ hasText: "Tara's van" }).filter({ hasText: "FLT-STD" });
  const vanBefore = Number(await vanRow.getByRole("cell").nth(2).innerText());

  // Technician finds the job under My jobs and drives it to completion on a phone.
  const tech = await signIn(browser, "technician@fieldservice.local", phone);
  await expect(tech.page).toHaveURL(/\/my-jobs$/);
  await tech.page.locator(`a[href="${workOrderUrl}"]`).click();
  await tech.page.getByRole("button", { name: "Accept" }).click();
  await expect(tech.page.getByText("Accepted", { exact: true })).toBeVisible();

  // After each step the customer sees it on their request.
  const progress = customer.page.getByRole("list", { name: "Visit progress" });
  async function customerSees(text: string | RegExp) {
    await customer.page.reload();
    await expect(progress.getByText(text)).toBeVisible();
  }

  await tech.page.getByRole("button", { name: "On my way" }).click();
  await expect(tech.page.getByText("En route", { exact: true }).first()).toBeVisible();
  await customerSees("On the way");

  await tech.page.getByRole("button", { name: "I've arrived" }).click();
  await expect(tech.page.getByText("Arrived", { exact: true }).first()).toBeVisible();
  await customerSees("Arrived");

  // Diagnosis and a photo on arrival.
  await tech.page.getByLabel("Diagnosis").fill("Clogged condensate drain");
  await tech.page.getByRole("button", { name: "Save report" }).click();
  await expect(tech.page.getByText("Report saved")).toBeVisible();
  await tech.page.getByLabel("Photo caption").fill("Drain before cleaning");
  await tech.page.getByLabel("Add photo").setInputFiles({ name: "drain.png", mimeType: "image/png", buffer: png });
  await expect(tech.page.getByRole("list", { name: "Visit photos" }).getByText("Drain before cleaning")).toBeVisible();

  // Reserve a filter from the van at diagnosis.
  const filterOption = tech.page.getByLabel("Part from van").locator("option", { hasText: "Air filter" });
  await tech.page.getByLabel("Part from van").selectOption((await filterOption.getAttribute("value"))!);
  await tech.page.getByRole("button", { name: "Reserve part" }).click();
  await expect(tech.page.getByRole("list", { name: "Visit parts" }).getByText("Reserved")).toBeVisible();

  await tech.page.getByRole("button", { name: "Start job" }).click();
  await expect(tech.page.getByText("In progress", { exact: true }).first()).toBeVisible();
  await customerSees("Work started");
  await expect(customer.page.getByText("Clogged condensate drain")).toBeVisible();

  // Use the reserved filter.
  await tech.page.getByRole("list", { name: "Visit parts" }).getByRole("button", { name: "Use" }).click();
  await expect(tech.page.getByRole("list", { name: "Visit parts" }).getByText("Used")).toBeVisible();

  // Work performed, a note, the customer's signature, then completion.
  await tech.page.getByLabel("Work performed").fill("Flushed the drain line and tested cooling");
  await tech.page.getByRole("button", { name: "Save report" }).click();
  await expect(tech.page.getByText("Work performed:")).toBeVisible();
  await tech.page.getByLabel("Add a note").fill("Recommend a filter change next visit");
  await tech.page.getByRole("button", { name: "Add note" }).click();
  await expect(tech.page.getByText("Recommend a filter change next visit")).toBeVisible();
  await expect(tech.page.getByRole("button", { name: "Complete job" })).toBeDisabled();
  await tech.page.getByLabel("Customer name").fill("Ana Customer");
  const pad = tech.page.locator("canvas");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await tech.page.mouse.move(box.x + 20, box.y + 40);
  await tech.page.mouse.down();
  await tech.page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
  await tech.page.mouse.move(box.x + 220, box.y + 30, { steps: 8 });
  await tech.page.mouse.up();
  await tech.page.screenshot({ path: `${screensDir}/technician-signature-375.png`, fullPage: true });
  await tech.page.getByRole("button", { name: "Save signature" }).click();
  await expect(tech.page.getByText("Signed by Ana Customer").first()).toBeVisible();
  await tech.page.getByRole("button", { name: "Complete job" }).click();
  await expect(tech.page.getByText("Job completed")).toBeVisible();
  await expect(tech.page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await tech.page.screenshot({ path: `${screensDir}/technician-visit-completed-375.png`, fullPage: true });

  await customerSees("Completed");
  await expect(customer.page.getByText("Flushed the drain line and tested cooling")).toBeVisible();
  await expect(customer.page.getByText("Signed by Ana Customer")).toBeVisible();
  const [photoTab] = await Promise.all([
    customer.page.waitForEvent("popup"),
    customer.page.getByRole("button", { name: "Drain before cleaning" }).click(),
  ]);
  await photoTab.close();
  await customer.page.screenshot({ path: `${screensDir}/customer-job-completed.png`, fullPage: true });

  // The van lost one filter and the ledger shows the use with its reason and actor.
  await ops.page.goto("/inventory");
  await expect(vanRow.getByRole("cell").nth(2)).toHaveText(String(vanBefore - 1));
  const ledgerRow = ops.page.getByRole("table", { name: "Stock movements" }).getByRole("row").nth(1);
  await expect(ledgerRow).toContainText("Used");
  await expect(ledgerRow).toContainText("Tara's van");
  await expect(ledgerRow).toContainText("Used on the visit");
  await expect(ledgerRow).toContainText("Tara Technician");
  await ops.page.screenshot({ path: `${screensDir}/ops-inventory-ledger.png`, fullPage: true });

  // Ops reviews the draft invoice prepared at completion and issues it.
  await ops.page.goto(workOrderUrl);
  const reportResponse = ops.page.waitForResponse((r) => r.url().endsWith("/report") && r.status() === 200);
  await ops.page.getByRole("button", { name: "Service report" }).click();
  expect((await reportResponse).headers()["content-type"]).toContain("application/pdf");
  await ops.page.getByRole("button", { name: "Invoice" }).click();
  const lines = ops.page.getByRole("table", { name: "Invoice lines" });
  await expect(lines.getByText("Service charge · Repair")).toBeVisible();
  await expect(lines.getByText("Labour (0.5 h)")).toBeVisible();
  await expect(lines.getByText("Air filter (FLT-STD)")).toBeVisible();
  // 500 service + 500 labour + 450 filter = 1,450; 9% CGST + 9% SGST = 261.
  await expect(ops.page.getByTestId("invoice-total")).toHaveText("₹1,711.00");
  await ops.page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(ops.page.getByText("Issued", { exact: true })).toBeVisible();
  const invoiceUrl = new URL(ops.page.url()).pathname;

  // The customer opens the invoice from the request. Online pay is off while the payment provider
  // is the mock, so there is no Pay button: the customer pays the office, which records it.
  await customer.page.reload();
  const optionsResponse = customer.page.waitForResponse((r) => r.url().endsWith("/invoices/payment-options"));
  await customer.page.getByRole("button", { name: "View invoice" }).click();
  await expect(customer.page).toHaveURL(new RegExp(`${invoiceUrl}$`));
  expect(await (await optionsResponse).json()).toEqual({ data: { onlinePay: false } });
  await expect(customer.page.getByTestId("invoice-pay-offline")).toHaveText("Pay ₹1,711.00 to the office by cash, UPI, card or bank transfer.");
  await expect(customer.page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  await customer.page.screenshot({ path: `${screensDir}/customer-invoice-due.png`, fullPage: true });
  await ops.page.reload();
  await ops.page.getByLabel("Amount").fill("1711.00");
  await ops.page.getByLabel("Method").selectOption("UPI");
  await ops.page.getByLabel("Reference").fill("UPI/401234567");
  await ops.page.getByRole("button", { name: "Record payment" }).click();
  await expect(ops.page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(ops.page.getByRole("list", { name: "Payments" })).toContainText("upi");
  await customer.page.reload();
  await expect(customer.page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(customer.page.getByTestId("invoice-pay-offline")).toHaveCount(0);
  await customer.page.screenshot({ path: `${screensDir}/customer-invoice-paid.png`, fullPage: true });

  // Ops credits part of the paid invoice (refund due), then records the refund.
  await ops.page.getByRole("button", { name: "Issue credit note" }).click();
  const creditDialog = ops.page.getByRole("dialog", { name: "Issue credit note" });
  await expect(creditDialog.getByTestId("credit-limit")).toHaveText("Creditable: ₹1,711.00");
  await creditDialog.getByLabel("Amount").fill("1711.01");
  await creditDialog.getByLabel("Reason").fill("Filter was covered by the supplier");
  await creditDialog.getByRole("button", { name: "Issue credit note" }).click();
  await expect(creditDialog.getByText("At most ₹1,711.00")).toBeVisible();
  await creditDialog.getByLabel("Amount").fill("450.00");
  await creditDialog.getByRole("button", { name: "Issue credit note" }).click();
  await expect(creditDialog).toBeHidden();
  await expect(ops.page.getByRole("region", { name: "Credit notes" })).toContainText("Filter was covered by the supplier");
  await expect(ops.page.getByTestId("invoice-refund-due")).toHaveText("₹450.00");
  await ops.page.getByRole("button", { name: "Refund", exact: true }).click();
  const refundDialog = ops.page.getByRole("dialog", { name: "Refund" });
  await expect(refundDialog.getByLabel("Amount")).toHaveValue("450.00");
  await refundDialog.getByLabel("Reason").fill("Refund of the filter credit");
  await refundDialog.getByRole("button", { name: "Record refund" }).click();
  await expect(refundDialog).toBeHidden();
  await expect(ops.page.getByRole("region", { name: "Refunds" })).toContainText("Refund of the filter credit");
  await expect(ops.page.getByTestId("invoice-refund-due")).toHaveCount(0);
  await expect(ops.page.getByTestId("invoice-balance")).toHaveText("₹0.00");
  await customer.page.reload();
  await expect(customer.page.getByRole("region", { name: "Credit notes" })).toContainText("₹450.00");
  await expect(customer.page.getByRole("region", { name: "Refunds" })).toContainText("₹450.00");
  await expect(customer.page.getByRole("button", { name: "Issue credit note" })).toHaveCount(0);
  await expect(customer.page.getByRole("button", { name: "Refund", exact: true })).toHaveCount(0);

  // Notifications: the customer's bell carries each step, ending with the payment receipt.
  await customer.page.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  const customerMenu = customer.page.getByRole("menu");
  await expect(customerMenu).toContainText("Payment received");
  await expect(customerMenu).toContainText("Service completed");
  await customer.page.screenshot({ path: `${screensDir}/customer-notifications.png`, fullPage: true });
  await customerMenu.getByText("Service completed").first().click();
  await expect(customer.page).toHaveURL(new RegExp(`/requests/${requestId}$`));

  // The customer rates the job; ops sees it in feedback and on the work order.
  await customer.page.getByRole("radio", { name: "4 stars" }).click();
  await customer.page.getByRole("button", { name: "Satisfied", exact: true }).click();
  await customer.page.getByLabel("Comments").fill("Quick and tidy");
  await customer.page.getByRole("button", { name: "Send feedback" }).click();
  await expect(customer.page.getByText("Your feedback")).toBeVisible();
  await ops.page.goto("/feedback");
  await expect(ops.page.getByRole("table", { name: "Feedback" })).toContainText("Quick and tidy");
  await ops.page.goto(workOrderUrl);
  await expect(ops.page.getByText(/4\/5 · Satisfied/)).toBeVisible();

  // The worker delivers on BullMQ: the office log shows this job's emails as sent.
  await ops.page.goto("/notifications");
  const log = ops.page.getByRole("table", { name: "Deliveries" });
  await expect(log).toContainText("Payment received");
  await expect(log.getByRole("row").filter({ hasText: "Payment received" }).filter({ hasText: "Email" }).first()).toContainText("Sent");
  await ops.page.screenshot({ path: `${screensDir}/ops-notification-deliveries.png`, fullPage: true });

  // The completed job moves to the Completed group under My jobs.
  await tech.page.goto("/my-jobs");
  await expect(tech.page.getByRole("region", { name: "Completed" }).locator(`a[href="${workOrderUrl}"]`)).toBeVisible();
  await tech.page.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await expect(tech.page.getByRole("menu")).toContainText("New job assigned");
  await tech.page.screenshot({ path: `${screensDir}/technician-notifications-375.png`, fullPage: true });
  await tech.page.keyboard.press("Escape");

  // Analytics spot check: the dashboard's pending invoices and completed jobs match the raw lists.
  const opsApi = await apiAs("ops@fieldservice.local");
  // The invoice list is paginated (Phase 12), so count each pending status through meta.total.
  const issued = await opsApi<{ meta: { total: number } }>("GET", "/invoices?status=ISSUED&limit=1");
  const overdue = await opsApi<{ meta: { total: number } }>("GET", "/invoices?status=OVERDUE&limit=1");
  const pendingCount = issued.meta.total + overdue.meta.total;
  await ops.page.goto("/");
  await expect(ops.page.getByTestId("stat-pending-invoices")).toHaveText(String(pendingCount));
  await expect(ops.page.getByTestId("stat-active-jobs")).toBeVisible();
  await ops.page.screenshot({ path: `${screensDir}/ops-dashboard.png`, fullPage: true });
  await ops.page.goto("/analytics");
  await ops.page.getByRole("button", { name: "7 days" }).click();
  const taraRow = ops.page.getByRole("table", { name: "Technician performance" }).getByRole("row").filter({ hasText: "Tara Technician" });
  const performance = await opsApi<{ data: { technician: { name: string }; jobsCompleted: number }[] }>(
    "GET",
    `/analytics/technicians?from=${new Date(Date.now() - 7 * 86_400_000).toISOString()}&to=${new Date(Date.now() + 60_000).toISOString()}`,
  );
  const taraCompleted = performance.data.find((row) => row.technician.name === "Tara Technician")!.jobsCompleted;
  expect(taraCompleted).toBeGreaterThan(0);
  await expect(taraRow.getByRole("cell").nth(1)).toHaveText(String(taraCompleted));
  await ops.page.screenshot({ path: `${screensDir}/ops-technician-performance.png`, fullPage: true });

  for (const session of [customer, ops, tech]) {
    expect(session.problems).toEqual([]);
    await session.close();
  }
});

