import { expect, test } from "@playwright/test";
import { apiAs, screensDir, signIn, slot } from "./helpers";

type Row = { id: string };
const signature = {
  signerName: "Ana Customer",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

test("a due maintenance plan opens a work order by itself and completing it uses a contract visit", async ({ browser }) => {
  const opsApi = await apiAs("ops@fieldservice.local");
  const techApi = await apiAs("technician@fieldservice.local");
  const customers = await opsApi<{ data: (Row & { name: string })[] }>("GET", "/customers?limit=100");
  const customer = customers.data.find((row) => row.name === "ABC Apartments")!;
  const detail = await opsApi<{ data: { addresses: Row[] } }>("GET", `/customers/${customer.id}`);
  const serial = `PM-${Date.now()}`;
  await opsApi("POST", "/assets", {
    customerId: customer.id,
    addressId: detail.data.addresses[0]!.id,
    equipmentType: "Chiller",
    model: "Cool 9",
    serialNumber: serial,
  });

  // Ops sets up the AMC with two included visits, then a monthly plan due today.
  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto("/contracts");
  await ops.page.getByRole("button", { name: "New contract" }).click();
  const dialog = ops.page.getByRole("dialog");
  await dialog.getByLabel("Customer").selectOption({ label: "ABC Apartments" });
  await dialog.getByLabel("Name").fill(`AMC ${serial}`);
  await dialog.getByLabel("Ends").fill("2099-12-31");
  await dialog.getByLabel("Included visits (blank for unlimited)").fill("2");
  await dialog.getByLabel(`Chiller · ${serial}`).check();
  await dialog.getByRole("button", { name: "Create contract" }).click();
  await expect(dialog).toHaveCount(0);
  const contractRow = ops.page.getByRole("table", { name: "Contracts" }).getByRole("row").filter({ hasText: `AMC ${serial}` });
  await expect(contractRow).toContainText("0 of 2 used · 2 left");

  await ops.page.getByRole("button", { name: "New plan" }).click();
  await dialog.getByLabel("Equipment").selectOption({ label: `ABC Apartments · Chiller · ${serial}` });
  await dialog.getByLabel("Service type").selectOption({ label: "Repair" });
  await dialog.getByLabel("Contract").selectOption({ label: `AMC ${serial}` });
  await dialog.getByLabel("Name").fill(`Monthly check ${serial}`);
  await dialog.getByLabel("Every (days)").fill("30");
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(dialog).toHaveCount(0);

  // Nobody presses anything: the API's maintenance timer opens the job.
  const planRow = ops.page.getByRole("table", { name: "Maintenance plans" }).getByRole("row").filter({ hasText: `Monthly check ${serial}` });
  await expect(async () => {
    await ops.page.reload();
    await expect(planRow.getByRole("link", { name: /^Open · / })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await ops.page.screenshot({ path: `${screensDir}/ops-maintenance-generated.png`, fullPage: true });
  await planRow.getByRole("link", { name: /^Open · / }).click();
  await expect(ops.page.getByText(`Preventive maintenance: Monthly check ${serial}`)).toBeVisible();
  await expect(ops.page.getByText("Maintenance plan")).toBeVisible();
  const workOrderId = ops.page.url().split("/").pop()!;

  // The job runs as usual.
  const technicians = await opsApi<{ data: (Row & { user: { name: string } })[] }>("GET", "/technicians");
  const tara = technicians.data.find((row) => row.user.name === "Tara Technician")!;
  await opsApi("POST", `/work-orders/${workOrderId}/assign`, { technicianId: tara.id });
  const scheduled = await opsApi<{ data: { visits: Row[] } }>("POST", `/work-orders/${workOrderId}/schedule`, {
    scheduledStart: slot(0, 2200).date.toISOString(),
  });
  const visitId = scheduled.data.visits[0]!.id;
  await techApi("POST", `/work-orders/${workOrderId}/accept`);
  for (const step of ["en-route", "arrive", "start"]) {
    await techApi("POST", `/visits/${visitId}/${step}`);
  }
  await techApi("PATCH", `/visits/${visitId}/report`, { workPerformed: "Monthly check done" });
  await techApi("POST", `/visits/${visitId}/signature`, signature);
  await techApi("POST", `/visits/${visitId}/complete`);

  // The contract counter goes down by one and the plan moves 30 days on.
  await ops.page.goto("/contracts");
  await expect(contractRow).toContainText("1 of 2 used · 1 left");
  const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + 30 * 86_400_000);
  await expect(planRow).toContainText(next.toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }));
  await expect(planRow.getByRole("link", { name: /^Completed · / })).toBeVisible();
  await ops.page.screenshot({ path: `${screensDir}/ops-contract-visit-used.png`, fullPage: true });
  expect(ops.problems).toEqual([]);
  await ops.close();
});
