import { expect, test } from "@playwright/test";
import { dialogSubmit, screensDir, signIn } from "./helpers";

test("ops adds technician time off on the calendar and the technician sees it at 375px", async ({ browser }) => {
  const reason = `Training ${Date.now()}`;
  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto("/schedule");
  await expect(ops.page.getByText("Scheduling", { exact: true }).last()).toBeVisible();
  await ops.page.getByRole("button", { name: "Add time off" }).click();
  const dialog = ops.page.getByRole("dialog");
  await dialog.getByLabel("Technician").selectOption({ label: "Tara Technician" });
  await dialog.getByLabel("From").fill("2026-12-24T09:00");
  await dialog.getByLabel("To").fill("2026-12-24T17:00");
  await dialog.getByLabel("Reason").fill(reason);
  await dialogSubmit(ops.page, "Add time off");
  await ops.page.getByLabel("Go to week").fill("2026-12-24");
  await expect(ops.page.getByText(`Tara Technician off · ${reason}`)).toBeVisible();
  expect(ops.problems).toEqual([]);
  await ops.close();

  const tech = await signIn(browser, "technician@fieldservice.local", { width: 375, height: 812 });
  await tech.page.goto("/schedule");
  await expect(tech.page.getByText("My schedule").first()).toBeVisible();
  await tech.page.getByLabel("Go to week").fill("2026-12-24");
  await expect(tech.page.getByText(`Tara Technician off · ${reason}`)).toBeVisible();
  await expect(tech.page.getByRole("button", { name: "Add time off" })).toHaveCount(0);
  await tech.page.screenshot({ path: `${screensDir}/technician-my-schedule-375.png`, fullPage: true });
  expect(tech.problems).toEqual([]);
  await tech.close();
});
