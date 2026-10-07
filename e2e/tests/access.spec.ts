import { expect, test } from "@playwright/test";
import { dialogSubmit, lastMailLink, password, screensDir, signIn } from "./helpers";

test("admin invites a user, the invitee joins, resets the password, and the audit log records it", async ({
  browser,
}) => {
  const email = `invitee-${Date.now()}@fieldservice.local`;
  const admin = await signIn(browser, "admin@fieldservice.local");
  await admin.page.goto("/users");
  await admin.page.getByRole("button", { name: "Invite user" }).click();
  await admin.page.getByLabel("Name").fill("Ivy Invitee");
  await admin.page.getByLabel("Email").fill(email);
  await dialogSubmit(admin.page, "Send invitation");
  await expect(admin.page.getByText(email)).toBeVisible();

  const invitee = await browser.newPage();
  await invitee.goto(await lastMailLink(email));
  await invitee.getByLabel("New password").fill(password);
  await invitee.getByLabel("Confirm password").fill(password);
  await invitee.getByRole("button", { name: "Create account" }).click();
  await expect(invitee).toHaveURL("http://localhost:5173/");
  await invitee.context().close();

  const anon = await browser.newPage();
  await anon.goto("/login");
  await anon.getByText("Forgot password?").click();
  await anon.getByLabel("Email").fill(email);
  await anon.getByRole("button", { name: "Send reset link" }).click();
  await expect(anon.getByText("Check your email")).toBeVisible();
  await anon.goto(await lastMailLink(email));
  await anon.getByLabel("New password").fill("Changed123!");
  await anon.getByLabel("Confirm password").fill("Changed123!");
  await anon.getByRole("button", { name: "Change password" }).click();
  await expect(anon.getByText("Password changed")).toBeVisible();
  await anon.context().close();

  await admin.page.goto("/audit");
  await expect(admin.page.getByText("users.invitations", { exact: true }).first()).toBeVisible();
  await expect(admin.page.getByText("auth.invitations.accept").first()).toBeVisible();
  await expect(admin.page.getByText("auth.password-reset.confirm").first()).toBeVisible();
  await admin.page.screenshot({ path: `${screensDir}/admin-audit-log.png`, fullPage: true });

  const ops = await signIn(browser, "ops@fieldservice.local");
  await ops.page.goto("/users");
  await expect(ops.page.getByRole("heading", { name: "Users and roles" })).toHaveCount(0);
  expect(admin.problems).toEqual([]);
  expect(ops.problems).toEqual([]);
  await admin.close();
  await ops.close();
});
