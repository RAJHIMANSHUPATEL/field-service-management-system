import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Layout containment: the office shell never scrolls the window sideways. A wide table scrolls
// inside its own container; the header stays one row. Works on any data set (the e2e seed or the
// demo): set LAYOUT_ADMIN_EMAIL / LAYOUT_TECH_EMAIL to run it against other users.
const adminEmail = process.env.LAYOUT_ADMIN_EMAIL ?? "admin@fieldservice.local";
const techEmail = process.env.LAYOUT_TECH_EMAIL ?? "technician@fieldservice.local";

const officePages = [
  ["Dashboard", "/"],
  ["Requests", "/requests"],
  ["Work orders", "/work-orders"],
  ["Scheduling", "/schedule"],
  ["Customers", "/customers"],
  ["Assets", "/assets"],
  ["Technicians", "/technicians"],
  ["Parts and stock", "/inventory"],
  ["Invoices", "/invoices"],
  ["Contracts", "/contracts"],
  ["Analytics", "/analytics"],
  ["Customer feedback", "/feedback"],
  ["Notifications", "/notifications"],
  ["Users", "/users"],
  ["Master data", "/master"],
  ["Audit log", "/audit"],
  ["Service types", "/service-types"],
] as const;

type Layout = {
  doc: { scrollWidth: number; clientWidth: number };
  inset: { scrollWidth: number; clientWidth: number };
  header: { height: number; childrenOnOneRow: boolean };
  sidebar: string | null;
  wideTables: { scrollWidth: number; clientWidth: number; overflowX: string; fitsCard: boolean; scrollingCardContents: number }[];
};

async function measure(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const d = document.documentElement;
    const inset = document.querySelector<HTMLElement>("main[data-slot=sidebar-inset]")!;
    const header = inset.querySelector<HTMLElement>(":scope > header")!;
    const box = header.getBoundingClientRect();
    const children = [...header.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.width > 0);
    const wideTables = [...document.querySelectorAll<HTMLElement>("[data-slot=table-container]")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => {
        const card = el.closest<HTMLElement>("[data-slot=card]");
        let scrollingCardContents = 0;
        for (let node = el.parentElement; node && node !== card; node = node.parentElement) {
          if (node.dataset.slot === "card-content" && ["auto", "scroll"].includes(getComputedStyle(node).overflowX)) scrollingCardContents += 1;
        }
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: getComputedStyle(el).overflowX,
          fitsCard: !card || el.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1,
          scrollingCardContents,
        };
      });
    return {
      doc: { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth },
      inset: { scrollWidth: inset.scrollWidth, clientWidth: inset.clientWidth },
      header: {
        height: Math.round(box.height),
        childrenOnOneRow: children.every((rect) => rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1),
      },
      sidebar: document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state") ?? null,
      wideTables,
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  test(`office pages stay inside the window at ${viewport.width}px with the sidebar open`, async ({ browser }) => {
    const admin = await signIn(browser, adminEmail, viewport);
    const { page } = admin;
    for (const [name, path] of officePages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Page not found")).toHaveCount(0);
      const layout = await measure(page);
      const where = `${name} at ${viewport.width}px`;
      expect(layout.sidebar, `${where}: sidebar open`).toBe("expanded");
      expect(layout.doc.scrollWidth, `${where}: the window scrolls sideways`).toBeLessThanOrEqual(layout.doc.clientWidth);
      // The inset hides horizontal overflow, so anything wider than it would be cut off.
      expect(layout.inset.scrollWidth, `${where}: content clipped by the inset`).toBeLessThanOrEqual(layout.inset.clientWidth);
      expect(layout.header.height, `${where}: header height`).toBeLessThanOrEqual(57);
      expect(layout.header.childrenOnOneRow, `${where}: header on one row`).toBe(true);
      for (const table of layout.wideTables) {
        expect(table.overflowX, `${where}: a wide table scrolls in its own container`).toBe("auto");
        expect(table.fitsCard, `${where}: a wide table stays inside its card`).toBe(true);
      }
    }
    expect(admin.problems).toEqual([]);
    await admin.close();
  });
}

test("technician screens at 375px still fit the phone", async ({ browser }) => {
  const tech = await signIn(browser, techEmail, { width: 375, height: 812 });
  for (const path of ["/my-jobs", "/schedule", "/profile"]) {
    await tech.page.goto(path);
    await tech.page.waitForLoadState("networkidle");
    const layout = await measure(tech.page);
    expect(layout.doc.scrollWidth, `${path} at 375px`).toBeLessThanOrEqual(layout.doc.clientWidth);
    expect(layout.header.childrenOnOneRow, `${path} header on one row`).toBe(true);
  }
  expect(tech.problems).toEqual([]);
  await tech.close();
});
