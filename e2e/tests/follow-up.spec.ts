import { expect, test } from "@playwright/test";
import { apiAs, dialogSubmit, screensDir, signIn, slot } from "./helpers";

type Row = { id: string };

test("a job that cannot finish on visit one completes on visit two, staying open in between", async ({ browser }) => {
  const description = `Follow-up ${Date.now()}`;
  const first = slot(0, 2070);
  const second = slot(1, 2070);

  // Arrange: a job on site for Tara (the steps the lifecycle spec already walks in the UI).
  const customerApi = await apiAs("customer@fieldservice.local");
  const opsApi = await apiAs("ops@fieldservice.local");
  const techApi = await apiAs("technician@fieldservice.local");
  const assets = await customerApi<{ data: Row[] }>("GET", "/assets?limit=1");
  const serviceTypes = await opsApi<{ data: Row[] }>("GET", "/service-types");
  const technicians = await opsApi<{ data: (Row & { user: { name: string } })[] }>("GET", "/technicians");
  const tara = technicians.data.find((row) => row.user.name === "Tara Technician")!;
  const created = await customerApi<{ data: Row }>("POST", "/service-requests", {
    assetId: assets.data[0]!.id,
    serviceTypeId: serviceTypes.data[0]!.id,
    description,
    preferredStart: "2026-11-02",
    preferredEnd: "2026-11-04",
  });
  const accepted = await opsApi<{ data: { workOrder: Row } }>("POST", `/service-requests/${created.data.id}/accept`, {});
  const workOrderId = accepted.data.workOrder.id;
  await opsApi("POST", `/work-orders/${workOrderId}/assign`, { technicianId: tara.id });
  const scheduled = await opsApi<{ data: { visits: Row[] } }>("POST", `/work-orders/${workOrderId}/schedule`, {
    scheduledStart: first.date.toISOString(),
  });
  await techApi("POST", `/work-orders/${workOrderId}/accept`);
  for (const step of ["en-route", "arrive", "start"]) {
    await techApi("POST", `/visits/${scheduled.data.visits[0]!.id}/${step}`);
  }

  // Visit one: the technician cannot finish and asks for a part, on a phone.
  const tech = await signIn(browser, "technician@fieldservice.local", { width: 375, height: 812 });
  await tech.page.goto(`/work-orders/${workOrderId}`);
  await tech.page.getByRole("button", { name: "Can't finish today" }).click();
  const dialog = tech.page.getByRole("dialog");
  await dialog.getByLabel("Outcome").selectOption("AWAITING_PARTS");
  await dialog.getByLabel("Reason").fill("Capacitor failed; none on the van");
  await dialog.getByLabel("Part needed").selectOption({ label: "CAP-35 · Run capacitor 35uF" });
  await dialogSubmit(tech.page, "End visit");
  await expect(tech.page.getByText("Awaiting parts").first()).toBeVisible();
  await expect(tech.page.getByText("Unsuccessful", { exact: true })).toBeVisible();
  await tech.page.screenshot({ path: `${screensDir}/technician-visit-unsuccessful-375.png`, fullPage: true });

  // The customer sees the job is still open and why.
  const customer = await signIn(browser, "customer@fieldservice.local");
  await customer.page.goto(`/requests/${created.data.id}`);
  await expect(customer.page.getByText("Awaiting parts")).toBeVisible();
  await expect(customer.page.getByText("Capacitor failed; none on the van")).toBeVisible();

  // Ops fulfils the part request and schedules visit two.
  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto(`/work-orders/${workOrderId}`);
  await expect(ops.page.getByRole("button", { name: "Schedule" })).toHaveCount(0);
  await ops.page.getByRole("list", { name: "Part requests" }).getByRole("button", { name: "Mark fulfilled" }).click();
  await expect(ops.page.getByText("Follow-up required").first()).toBeVisible();
  await ops.page.getByRole("button", { name: "Schedule" }).click();
  await ops.page.getByLabel("Date and time").fill(second.local);
  await dialogSubmit(ops.page, "Schedule");
  await expect(ops.page.getByText("Assigned", { exact: true }).first()).toBeVisible();

  // Visit two: accept, drive, complete.
  await tech.page.reload();
  await tech.page.getByRole("button", { name: "Accept" }).click();
  for (const [button, status] of [
    ["On my way", "En route"],
    ["I've arrived", "Arrived"],
    ["Start job", "In progress"],
  ] as const) {
    await tech.page.getByRole("button", { name: button }).click();
    await expect(tech.page.getByText(status, { exact: true }).first()).toBeVisible();
  }
  await tech.page.getByLabel("Work performed").fill("Fitted the new capacitor");
  await tech.page.getByRole("button", { name: "Save report" }).click();
  await expect(tech.page.getByText("Work performed:")).toBeVisible();
  await tech.page.getByLabel("Customer name").fill("Ana Customer");
  const pad = tech.page.locator("canvas");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await tech.page.mouse.move(box.x + 20, box.y + 40);
  await tech.page.mouse.down();
  await tech.page.mouse.move(box.x + 200, box.y + 60, { steps: 6 });
  await tech.page.mouse.up();
  await tech.page.getByRole("button", { name: "Save signature" }).click();
  await expect(tech.page.getByText("Signed by Ana Customer").first()).toBeVisible();
  await tech.page.getByRole("button", { name: "Complete job" }).click();
  await expect(tech.page.getByText("Job completed")).toBeVisible();
  await tech.page.screenshot({ path: `${screensDir}/technician-visit-two-completed-375.png`, fullPage: true });

  await customer.page.reload();
  await expect(customer.page.getByText("Completed").first()).toBeVisible();
  await expect(customer.page.getByRole("region", { name: "Job progress" })).toHaveCount(2);

  for (const session of [tech, customer, ops]) {
    expect(session.problems).toEqual([]);
    await session.close();
  }
});
