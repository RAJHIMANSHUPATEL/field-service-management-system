import { expect, test } from "@playwright/test";
import { apiAs, signIn, slot } from "./helpers";

type Row = { id: string };

const signature = {
  signerName: "Ana Customer",
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

test("a contract-covered job produces only the covered-out amount", async ({ browser }) => {
  const opsApi = await apiAs("ops@fieldservice.local");
  const techApi = await apiAs("technician@fieldservice.local");
  const customerApi = await apiAs("customer@fieldservice.local");

  // Arrange: a new unit on an AMC that covers the service charge and labour, then a finished job.
  const customers = await opsApi<{ data: (Row & { name: string })[] }>("GET", "/customers?limit=100");
  const customer = customers.data.find((row) => row.name === "ABC Apartments")!;
  const addresses = await opsApi<{ data: { addresses: Row[] } }>("GET", `/customers/${customer.id}`);
  const serial = `AMC-${Date.now()}`;
  const asset = await opsApi<{ data: Row }>("POST", "/assets", {
    customerId: customer.id,
    addressId: addresses.data.addresses[0]!.id,
    equipmentType: "Chiller",
    model: "Cool 9",
    serialNumber: serial,
  });
  await opsApi("POST", "/contracts", {
    customerId: customer.id,
    name: `AMC ${serial}`,
    startsOn: "2026-01-01",
    endsOn: "2099-12-31",
    assetIds: [asset.data.id],
    serviceChargeCoveredPercent: 100,
    labourCoveredPercent: 100,
    partsCoveredPercent: 0,
  });
  const serviceTypes = await opsApi<{ data: (Row & { name: string })[] }>("GET", "/service-types");
  const repair = serviceTypes.data.find((row) => row.name === "Repair")!;
  const technicians = await opsApi<{ data: (Row & { user: { name: string } })[] }>("GET", "/technicians");
  const tara = technicians.data.find((row) => row.user.name === "Tara Technician")!;
  const created = await customerApi<{ data: Row }>("POST", "/service-requests", {
    assetId: asset.data.id,
    serviceTypeId: repair.id,
    description: `Chiller noisy ${serial}`,
    preferredStart: "2026-11-02",
    preferredEnd: "2026-11-04",
  });
  const accepted = await opsApi<{ data: { workOrder: Row } }>("POST", `/service-requests/${created.data.id}/accept`, {});
  const workOrderId = accepted.data.workOrder.id;
  await opsApi("POST", `/work-orders/${workOrderId}/assign`, { technicianId: tara.id });
  const scheduled = await opsApi<{ data: { visits: Row[] } }>("POST", `/work-orders/${workOrderId}/schedule`, {
    scheduledStart: slot(0, 2100).date.toISOString(),
  });
  const visitId = scheduled.data.visits[0]!.id;
  await techApi("POST", `/work-orders/${workOrderId}/accept`);
  for (const step of ["en-route", "arrive", "start"]) {
    await techApi("POST", `/visits/${visitId}/${step}`);
  }
  await techApi("PATCH", `/visits/${visitId}/report`, { workPerformed: "Tightened the fan mount" });
  await techApi("POST", `/visits/${visitId}/signature`, signature);
  const done = await techApi<{ data: { invoice: Row } }>("POST", `/visits/${visitId}/complete`);

  // Ops sees the coverage on the draft and issues it.
  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto(`/invoices/${done.data.invoice.id}`);
  await expect(ops.page.getByText("Covered by contract")).toBeVisible();
  const totals = ops.page.getByRole("definition");
  await expect(ops.page.getByLabel("Invoice totals")).toContainText("Covered");
  // 500 service + 500 labour, both covered: nothing is billable, so the total is zero.
  await expect(ops.page.getByTestId("invoice-total")).toHaveText("₹0.00");
  await expect(totals.first()).toHaveText("₹1,000.00");
  await ops.page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(ops.page.getByText("Paid", { exact: true }).first()).toBeVisible();

  // The customer sees the covered invoice, with nothing to pay.
  const customerSession = await signIn(browser, "customer@fieldservice.local");
  await customerSession.page.goto(`/invoices/${done.data.invoice.id}`);
  await expect(customerSession.page.getByText("Covered by contract")).toBeVisible();
  await expect(customerSession.page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);

  for (const session of [ops, customerSession]) {
    expect(session.problems).toEqual([]);
    await session.close();
  }
});
