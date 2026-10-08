import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// A refresh whose response is lost (the page reloads while POST /auth/refresh is in flight) must
// not sign the user out: the retry with the old cookie gets the same new token back.
test("reloading while a refresh is in flight keeps the user signed in", async ({ browser }) => {
  const { page, problems, close } = await signIn(browser, "ops@fieldservice.local");
  await expect(page.getByTestId("stat-active-jobs")).toBeVisible();
  const context = page.context();
  const oldCookie = (await context.cookies()).find((cookie) => cookie.name === "refreshToken");
  expect(oldCookie).toBeTruthy();

  // Let the refresh reach the server (which rotates the token), then drop the response so the
  // browser keeps the old cookie, as it does when a reload cancels the request.
  let issued: string | undefined;
  await page.route("**/api/v1/auth/refresh", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    issued = /refreshToken=([^;]+)/.exec(response.headers()["set-cookie"] ?? "")?.[1];
    await context.addCookies([oldCookie!]);
    await route.abort("aborted");
  });
  await page.evaluate(() => fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" }).catch(() => null));
  await page.unrouteAll({ behavior: "wait" });
  expect(issued).toBeTruthy();
  expect(issued).not.toBe(oldCookie!.value);

  const retried = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/refresh"));
  await page.reload();
  const retry = await retried;
  expect(retry.status()).toBe(200);
  expect(/refreshToken=([^;]+)/.exec((await retry.allHeaders())["set-cookie"] ?? "")?.[1]).toBe(issued);

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("stat-active-jobs")).toBeVisible();
  // The family is still alive: a later page load refreshes normally.
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/work-orders/);
  await expect(page.getByRole("heading", { name: "Work orders" }).or(page.getByText("Work orders").first())).toBeVisible();
  expect(problems).toEqual([]);
  await close();
});
