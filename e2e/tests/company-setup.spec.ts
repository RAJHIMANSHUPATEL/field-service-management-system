import { expect, test } from "@playwright/test";
import { dialogSubmit, password, screensDir } from "./helpers";

test("a new admin sets up a whole company from nothing", async ({ browser }) => {
  const stamp = Date.now();
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400 && !response.url().endsWith("/auth/refresh")) {
      problems.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/login");
  await page.getByText("New company? Set it up").click();
  await page.getByLabel("Company name").fill(`Cool Air ${stamp}`);
  await page.getByLabel("Your name").fill("Owner");
  await page.getByLabel("Email").fill(`owner-${stamp}@coolair.example`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page).toHaveURL(/\/master$/);

  for (const [button, fields, submit] of [
    ["Add skill", { Name: "Refrigerant handling" }, "Add skill"],
    ["Add service area", { Name: "Central", "Postal codes": "78701, 78702" }, "Add service area"],
    ["Add part", { SKU: "CAP-35", Name: "Capacitor", "Unit price": "1250.00" }, "Add part"],
    ["Add location", { Name: "Main store" }, "Add location"],
  ] as const) {
    await page.getByRole("button", { name: button }).click();
    for (const [label, value] of Object.entries(fields)) {
      await page.getByRole("dialog").getByLabel(label, { exact: true }).fill(value);
    }
    await dialogSubmit(page, submit);
  }
  await expect(page.getByText("INR 1250.00")).toBeVisible();
  await expect(page.getByText("78701, 78702")).toBeVisible();

  await page.goto("/service-types");
  await page.getByRole("button", { name: "Add service type" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("AC repair");
  await dialogSubmit(page, "Add service type");

  await page.goto("/technicians");
  await page.getByRole("button", { name: "Add technician" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Tara");
  await page.getByRole("dialog").getByLabel("Email").fill(`tara-${stamp}@coolair.example`);
  await page.getByRole("dialog").getByLabel("Password").fill(password);
  await dialogSubmit(page, "Add technician");
  await page.getByRole("button", { name: "Set skills and areas" }).click();
  await page.getByRole("dialog").getByLabel("Refrigerant handling").check();
  await page.getByRole("dialog").getByLabel("Central").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Refrigerant handling, Central" })).toBeVisible();

  await page.goto("/master");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Tara's van");
  await page.getByRole("dialog").getByLabel("Kind").selectOption("VAN");
  await page.getByRole("dialog").getByLabel("Technician").selectOption({ label: "Tara" });
  await dialogSubmit(page, "Add location");

  await page.goto("/customers");
  await page.getByRole("button", { name: "New customer" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("ABC Apartments");
  await dialogSubmit(page, "Create customer");
  await expect(page).toHaveURL(/\/customers\/c/);
  await page.getByRole("button", { name: "Add address" }).click();
  for (const [label, value] of [
    ["Label", "Tower A"],
    ["Address line 1", "1 Main"],
    ["City", "Austin"],
    ["State", "TX"],
    ["Postal code", "78701"],
  ]) {
    await page.getByRole("dialog").getByLabel(label).fill(value);
  }
  await dialogSubmit(page, "Add address");
  await page.getByRole("button", { name: "Add asset" }).click();
  await page.getByRole("dialog").getByLabel("Equipment type").fill("Split AC");
  await page.getByRole("dialog").getByLabel("Model").fill("Cool 2T");
  await page.getByRole("dialog").getByLabel("Serial number").fill(`AC-${stamp}`);
  await page.getByRole("dialog").getByLabel("Warranty expires").fill("2027-12-31");
  await dialogSubmit(page, "Add asset");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByRole("dialog").getByLabel("Contact name").fill("Cara");
  await page.getByRole("dialog").getByLabel("Email").fill(`cara-${stamp}@abc.example`);
  await page.getByRole("dialog").getByLabel("Password for a customer login").fill(password);
  await dialogSubmit(page, "Add contact");

  await page.goto("/assets");
  await expect(page.getByText("Until 2027-12-31")).toBeVisible();
  await page.screenshot({ path: `${screensDir}/admin-company-setup-assets.png`, fullPage: true });
  await page.goto("/master");
  await page.screenshot({ path: `${screensDir}/admin-master-data.png`, fullPage: true });
  expect(problems).toEqual([]);
  await page.context().close();
});
