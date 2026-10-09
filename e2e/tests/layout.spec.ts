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
  scrollingCardContents: number;
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
      scrollingCardContents: [...document.querySelectorAll<HTMLElement>("[data-slot=card-content]")].filter(
        (el) => el.querySelector("[data-slot=table-container]") && ["auto", "scroll"].includes(getComputedStyle(el).overflowX),
      ).length,
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
      // One horizontal scrollbar: never on a CardContent around a table.
      expect(layout.scrollingCardContents, `${where}: CardContent with its own overflow-x`).toBe(0);
      for (const table of layout.wideTables) {
        expect(table.overflowX, `${where}: a wide table scrolls in its own container`).toBe("auto");
        expect(table.fitsCard, `${where}: a wide table stays inside its card`).toBe(true);
        expect(table.scrollingCardContents, `${where}: a second scrollbar around the table`).toBe(0);
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

type WeekLayout = {
  doc: { scrollWidth: number; clientWidth: number };
  inset: { scrollWidth: number; clientWidth: number };
  week: { scrollWidth: number; clientWidth: number; overflowX: string; insideCard: boolean };
  columns: number;
  visits: number;
  overflowingCards: string[];
  clippedBadges: number;
  headersVisible: number;
  toolbar: { scrollWidth: number; clientWidth: number; childrenInside: boolean };
  cardHeader: { scrollWidth: number; clientWidth: number; actionInside: boolean };
};

async function measureWeek(page: Page): Promise<WeekLayout> {
  return page.evaluate(() => {
    const d = document.documentElement;
    const inset = document.querySelector<HTMLElement>("main[data-slot=sidebar-inset]")!;
    const week = document.querySelector<HTMLElement>("[data-testid=schedule-week]")!;
    const card = week.closest<HTMLElement>("[data-slot=card]")!;
    const cardBox = card.getBoundingClientRect();
    const weekBox = week.getBoundingClientRect();
    const sections = [...week.querySelectorAll<HTMLElement>("section[aria-label]")];
    const cards = sections.flatMap((section) => [...section.querySelectorAll<HTMLElement>("a")]);
    const toolbar = card.querySelector<HTMLElement>("[data-slot=card-content] > div")!;
    const toolbarBox = toolbar.getBoundingClientRect();
    const header = card.querySelector<HTMLElement>("[data-slot=card-header]")!;
    const action = header.querySelector<HTMLElement>("[data-slot=card-action]");
    return {
      doc: { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth },
      inset: { scrollWidth: inset.scrollWidth, clientWidth: inset.clientWidth },
      week: {
        scrollWidth: week.scrollWidth,
        clientWidth: week.clientWidth,
        overflowX: getComputedStyle(week).overflowX,
        insideCard: weekBox.left >= cardBox.left - 1 && weekBox.right <= cardBox.right + 1,
      },
      columns: sections.length,
      visits: cards.length,
      overflowingCards: cards.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.innerText.replace(/\s+/g, " ")),
      clippedBadges: [...week.querySelectorAll<HTMLElement>("[data-slot=badge]")].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      // A header counts as visible when it is inside both the week's scrollport and the window.
      headersVisible: [...week.querySelectorAll<HTMLElement>("section[aria-label] > h3")].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.top >= weekBox.top - 1 && box.bottom <= weekBox.bottom + 1 && box.bottom <= window.innerHeight;
      }).length,
      toolbar: {
        scrollWidth: toolbar.scrollWidth,
        clientWidth: toolbar.clientWidth,
        childrenInside: [...toolbar.children].every((child) => child.getBoundingClientRect().right <= toolbarBox.right + 1),
      },
      cardHeader: {
        scrollWidth: header.scrollWidth,
        clientWidth: header.clientWidth,
        actionInside: !action || action.getBoundingClientRect().right <= header.getBoundingClientRect().right + 1,
      },
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  for (const [who, email] of [
    ["office", adminEmail],
    ["technician", techEmail],
  ] as const) {
    test(`the ${who} week schedule stays inside its card at ${viewport.width}px with the sidebar open`, async ({ browser }) => {
      const session = await signIn(browser, email, viewport);
      const { page } = session;
      await page.goto("/schedule");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("schedule-week")).toBeVisible();
      await expect(page.getByLabel("Technician")).toHaveCount(who === "office" ? 1 : 0);
      const where = `${who} /schedule at ${viewport.width}px`;
      expect(await page.locator("[data-slot=sidebar]").getAttribute("data-state"), `${where}: sidebar open`).toBe("expanded");

      const check = async (layout: WeekLayout, step: string) => {
        const at = `${where} (${step})`;
        expect(layout.doc.scrollWidth, `${at}: the window scrolls sideways`).toBeLessThanOrEqual(layout.doc.clientWidth);
        expect(layout.inset.scrollWidth, `${at}: content clipped by the inset`).toBeLessThanOrEqual(layout.inset.clientWidth);
        expect(layout.columns, `${at}: seven days`).toBe(7);
        expect(layout.week.insideCard, `${at}: the week stays inside its card`).toBe(true);
        if (layout.week.scrollWidth > layout.week.clientWidth + 1) {
          expect(layout.week.overflowX, `${at}: a wide week scrolls in its own container`).toBe("auto");
        }
        expect(layout.overflowingCards, `${at}: visit cards wider than their day`).toEqual([]);
        expect(layout.clippedBadges, `${at}: status badges cut off`).toBe(0);
        expect(layout.headersVisible, `${at}: day headers in view`).toBe(7);
        expect(layout.toolbar.scrollWidth, `${at}: toolbar overflows`).toBeLessThanOrEqual(layout.toolbar.clientWidth);
        expect(layout.toolbar.childrenInside, `${at}: toolbar control outside the card`).toBe(true);
        expect(layout.cardHeader.scrollWidth, `${at}: card header overflows`).toBeLessThanOrEqual(layout.cardHeader.clientWidth);
        expect(layout.cardHeader.actionInside, `${at}: Add time off outside the header`).toBe(true);
      };

      const layout = await measureWeek(page);
      // The e2e seed (and the demo) always put visits in the current week.
      expect(layout.visits, `${where}: visits in the current week`).toBeGreaterThan(0);
      await check(layout, "initial");

      // Scrolling the week (both ways) moves only the week: headers stay at its top, the window stays put.
      const week = page.getByTestId("schedule-week");
      await week.evaluate((el) => el.scrollTo({ left: el.scrollWidth, top: el.scrollHeight }));
      expect(await page.evaluate(() => window.scrollX), `${where}: window scrolled sideways`).toBe(0);
      const scrolled = await measureWeek(page);
      await check(scrolled, "scrolled to the end");
      const lastHeader = week.locator("section[aria-label] > h3").last();
      await expect(lastHeader).toBeInViewport();
      expect(session.problems).toEqual([]);
      await session.close();
    });
  }
}

// Card header actions sit beside the title when there is room and wrap below it, aligned to the
// end, when there is not. A long title and an unbreakable link in the description must never push
// a button past the card's padding (the inset's overflow-x-hidden would hide that from the window).
const actionPages = [
  ["Analytics", "/analytics"],
  ["Parts and stock", "/inventory"],
  ["Contracts and maintenance", "/contracts"],
] as const;

type ActionHeader = {
  title: string;
  outsidePadding: { text: string; right: number; paddingEdge: number; left: number; leftEdge: number }[];
  clipped: string[];
  broken: string[];
  sameRowAsTitle: boolean;
};

async function measureActions(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const headers = [...document.querySelectorAll<HTMLElement>("[data-slot=card-header]")].filter((el) =>
      el.querySelector("[data-slot=card-action]"),
    );
    return {
      doc: { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth },
      headers: headers.map((header): ActionHeader => {
        const card = header.closest<HTMLElement>("[data-slot=card]")!.getBoundingClientRect();
        const style = getComputedStyle(header);
        const paddingEdge = card.right - parseFloat(style.paddingRight);
        const leftEdge = card.left + parseFloat(style.paddingLeft);
        const title = header.querySelector<HTMLElement>("[data-slot=card-title]")!;
        const action = header.querySelector<HTMLElement>("[data-slot=card-action]")!;
        const controls = [...action.querySelectorAll<HTMLElement>("button, a")];
        const clipped = controls.filter((control) => {
          const box = control.getBoundingClientRect();
          for (let node = control.parentElement; node; node = node.parentElement) {
            const s = getComputedStyle(node);
            if (s.overflowX === "visible" && s.overflowY === "visible") continue;
            const outer = node.getBoundingClientRect();
            if (box.left < outer.left - 0.5 || box.right > outer.right + 0.5 || box.top < outer.top - 0.5 || box.bottom > outer.bottom + 0.5) return true;
          }
          return false;
        });
        return {
          title: title.textContent ?? "",
          outsidePadding: controls
            .map((control) => ({ text: control.textContent?.trim() ?? "", ...control.getBoundingClientRect().toJSON(), paddingEdge, leftEdge }))
            .filter((box) => box.right > paddingEdge + 0.5 || box.left < leftEdge - 0.5)
            .map(({ text, right, left }) => ({ text, right, paddingEdge, left, leftEdge })),
          clipped: clipped.map((control) => control.textContent?.trim() ?? ""),
          // Each button stays whole: one line, its text not cut.
          broken: controls.filter((control) => control.scrollWidth > control.clientWidth + 1).map((control) => control.textContent?.trim() ?? ""),
          sameRowAsTitle: action.getBoundingClientRect().top < title.getBoundingClientRect().bottom,
        };
      }),
    };
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
]) {
  test(`card header actions stay inside their cards at ${viewport.width}px with the sidebar open`, async ({ browser }) => {
    const admin = await signIn(browser, adminEmail, viewport);
    const { page } = admin;
    for (const [name, path] of actionPages) {
      for (const variant of ["as rendered", "with a long title and an unbreakable link"] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("[data-slot=card-action] button").first()).toBeVisible();
        expect(await page.locator("[data-slot=sidebar]").getAttribute("data-state")).toBe("expanded");
        if (variant !== "as rendered") {
          await page.evaluate(() => {
            for (const header of document.querySelectorAll("[data-slot=card-header]")) {
              if (!header.querySelector("[data-slot=card-action]")) continue;
              const title = header.querySelector("[data-slot=card-title]");
              const description = header.querySelector("[data-slot=card-description]");
              if (title) title.textContent = "Technician performance, first-visit resolution and completion time for every service region";
              if (description) {
                description.textContent =
                  "Escalations: https://facilities.srivenkateshwaracooperativehousingsocietyresidentswelfareassociation.example.com/helpdesk/plantroom/escalations every working day.";
              }
            }
          });
        }
        const layout = await measureActions(page);
        const where = `${name} at ${viewport.width}px (${variant})`;
        expect(layout.headers.length, `${where}: card headers with actions`).toBeGreaterThan(0);
        expect(layout.doc.scrollWidth, `${where}: the window scrolls sideways`).toBeLessThanOrEqual(layout.doc.clientWidth);
        for (const header of layout.headers) {
          const at = `${where} "${header.title.slice(0, 40)}"`;
          expect(header.outsidePadding, `${at}: buttons past the card padding`).toEqual([]);
          expect(header.clipped, `${at}: buttons clipped by an overflow-hidden ancestor`).toEqual([]);
          expect(header.broken, `${at}: buttons cut or squeezed`).toEqual([]);
          if (viewport.width === 1280 && variant === "as rendered") {
            expect(header.sameRowAsTitle, `${at}: actions stacked under a short title on a wide desktop`).toBe(true);
          }
        }
      }
    }
    expect(admin.problems).toEqual([]);
    await admin.close();
  });
}
