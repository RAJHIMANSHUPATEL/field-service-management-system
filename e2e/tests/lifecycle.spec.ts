import { expect, test } from "@playwright/test";
import { dialogSubmit, screensDir, signIn } from "./helpers";

const phone = { width: 375, height: 812 };

test("request, triage, assign, schedule, accept, visit", async ({ browser }) => {
  const description = `Lifecycle ${Date.now()}`;

  // Customer reports a problem.
  const customer = await signIn(browser, "customer@fieldservice.local");
  await customer.page.goto("/requests");
  await customer.page.getByRole("button", { name: "New request" }).click();
  await customer.page.getByLabel("Equipment").selectOption({ index: 1 });
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
  await ops.page.getByRole("dialog").getByLabel("Technician").selectOption({ label: "Tara Technician" });
  await dialogSubmit(ops.page, "Assign");
  await ops.page.getByRole("button", { name: "Schedule" }).click();
  await ops.page.getByLabel("Date and time").fill("2026-11-03T10:00");
  await dialogSubmit(ops.page, "Schedule");
  await expect(ops.page.getByText("Scheduled", { exact: true })).toBeVisible();

  // Technician accepts and drives the visit on a phone.
  const tech = await signIn(browser, "technician@fieldservice.local", phone);
  await tech.page.goto(workOrderUrl);
  await tech.page.getByRole("button", { name: "Accept" }).click();
  await expect(tech.page.getByText("Accepted", { exact: true })).toBeVisible();
  for (const [button, status] of [
    ["On my way", "En route"],
    ["I've arrived", "Arrived"],
    ["Start job", "In progress"],
  ] as const) {
    await tech.page.getByRole("button", { name: button }).click();
    await expect(tech.page.getByText(status, { exact: true }).first()).toBeVisible();
  }
  await tech.page.screenshot({ path: `${screensDir}/technician-visit-in-progress.png`, fullPage: true });

  // The customer sees the same state on their request.
  await customer.page.reload();
  await expect(customer.page.getByText("In progress").first()).toBeVisible();
  await expect(customer.page.getByText(/Nov 3, 2026.*In progress/)).toBeVisible();

  for (const session of [customer, ops, tech]) {
    expect(session.problems).toEqual([]);
    await session.close();
  }
});
