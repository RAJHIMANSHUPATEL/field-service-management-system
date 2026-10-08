// Demo seed: a realistic Indian facility-services company with ~3 months of history and two weeks
// of upcoming work. Run with `npm run db:seed:demo`. It is separate from prisma/seed.ts (which the
// tests and e2e rely on) and lives in its own organization, so it never touches that data.
//
// How it stays consistent: every change goes through the real HTTP API in-process (Zod, role and
// org checks, transition rules, audit middleware, stock ledger, invoicing, notifications), while a
// simulated clock replays each action at the moment it "happened". Deterministic: a fixed RNG seed
// (DEMO_SEED) and an anchor date (DEMO_ANCHOR, default today in IST) give the same dataset.
// Idempotent: the demo organization is deleted and rebuilt on every run.
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { installClock, onClockChange, realNow, setClock, simulatedNow } from "./clock.js";
import * as data from "./data.js";
import { signaturePng, sitePhoto } from "./png.js";
import { deleteOrganization } from "./reset.js";
import { Rng } from "./rng.js";

installClock();
Object.assign(process.env, {
  RATE_LIMIT_AUTH: "0",
  RATE_LIMIT_API: "0",
  RATE_LIMIT_STORE: "memory",
  NOTIFICATION_QUEUE: "inline",
  MAIL_PROVIDER: "log",
  SMS_PROVIDER: "log",
});
const say = (message: string) => process.stdout.write(`${message}\n`);
if (process.env.DEMO_VERBOSE !== "1") {
  console.log = () => undefined; // request logs and local mail/SMS echoes
}

const { createApp } = await import("../../src/app.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { sentMail } = await import("../../src/lib/mailer.js");
const { setStorageClockOffset } = await import("../../src/lib/storage.js");
const { accessTokenFor } = await import("../../src/modules/auth/auth.service.js");
onClockChange(setStorageClockOffset);

// ---------------------------------------------------------------- time
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST_OFFSET = 330 * MIN;
const istDate = (ms: number) => new Date(ms + IST_OFFSET).toISOString().slice(0, 10);
const anchorDate = process.env.DEMO_ANCHOR ?? istDate(realNow());
const anchor = Date.parse(`${anchorDate}T00:00:00+05:30`);
const NOW = process.env.DEMO_ANCHOR ? anchor + 11 * HOUR : realNow();
const at = (day: number, hour: number, minute = 0) => anchor + day * DAY + (hour * 60 + minute) * MIN;
const dayOf = (ms: number) => Math.floor((ms - anchor) / DAY);
const weekday = (day: number) => new Date(anchor + day * DAY + 12 * HOUR + IST_OFFSET).getUTCDay();
const weekStart = -((weekday(0) + 6) % 7);
const iso = (ms: number) => new Date(ms).toISOString();
const dateOnly = (ms: number) => istDate(ms);
const SLOTS = [9 * 60 + 30, 12 * 60, 14 * 60 + 30, 17 * 60];
const VISIT_MINUTES = 120;

const rng = new Rng(Number(process.env.DEMO_SEED ?? 20261008));

// ---------------------------------------------------------------- in-process API
const app = createApp();
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
const tokens = new Map<string, { token: string; at: number }>();

async function tokenFor(userId: string) {
  const cached = tokens.get(userId);
  if (cached && simulatedNow() - cached.at < 10 * MIN) return cached.token;
  const token = await accessTokenFor(userId);
  tokens.set(userId, { token, at: simulatedNow() });
  return token;
}

type ApiOptions = { as?: string; body?: unknown; png?: Buffer; fileName?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(method: string, path: string, options: ApiOptions = {}): Promise<any> {
  const headers: Record<string, string> = {};
  if (options.as) headers.Authorization = `Bearer ${await tokenFor(options.as)}`;
  let body: BodyInit | undefined;
  if (options.png) {
    headers["Content-Type"] = "image/png";
    headers["X-File-Name"] = encodeURIComponent(options.fileName ?? "photo.png");
    body = new Blob([new Uint8Array(options.png)]);
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${base}${path}`, { method, headers, body });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- event queue
type Event = { at: number; seq: number; label: string; run: () => Promise<void> };
const queue: Event[] = [];
let sequence = 0;
let clockNow = 0;
function later(when: number, label: string, run: () => Promise<void>) {
  if (when > NOW) return false;
  const event = { at: Math.max(when, clockNow), seq: sequence++, label, run };
  let low = 0;
  let high = queue.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const other = queue[mid]!;
    if (other.at < event.at || (other.at === event.at && other.seq < event.seq)) low = mid + 1;
    else high = mid;
  }
  queue.splice(low, 0, event);
  return true;
}

// ---------------------------------------------------------------- helpers
const slug = (value: string) =>
  value
    .replace(/^Dr\.\s*/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
let phoneSerial = 0;
const mobile = () => `+91 90000 ${String(10001 + phoneSerial++).padStart(5, "0")}`;
const landline: Record<data.City, string> = { Bengaluru: "80", Mumbai: "22", Pune: "20", Hyderabad: "40" };
let landlineSerial = 0;
const officePhone = (city: data.City) => `+91 ${landline[city]} 4000 ${String(1001 + landlineSerial++)}`;
const money = (value: number) => value.toFixed(2);
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
// Office hours for staff actions: 09:00–19:30 IST, moved to the next morning otherwise.
function officeHours(ms: number) {
  const minutes = Math.floor(((ms - anchor) % DAY + DAY) % DAY / MIN);
  if (minutes < 9 * 60) return ms + (9 * 60 + 15 - minutes) * MIN;
  if (minutes > 19 * 60 + 30) return ms + (24 * 60 - minutes + 9 * 60 + 15) * MIN;
  return ms;
}

// ---------------------------------------------------------------- world state
type Tech = data.TechnicianSeed & { id: string; userId: string; vanId: string; index: number };
type CustomerRow = Omit<data.CustomerSeed, "assets"> & {
  id: string;
  addressId: string;
  area: string;
  contactUserId: string;
  contactName: string;
  assets: { id: string; key: keyof typeof data.equipment; label: string; contract?: string }[];
};
const world = {
  adminId: "",
  ops: [] as { userId: string; cities: readonly string[] }[],
  skills: new Map<string, string>(),
  areas: new Map<string, string>(),
  serviceTypes: new Map<data.ServiceTypeKey, string>(),
  parts: new Map<string, { id: string; price: number }>(),
  stores: new Map<data.City, string>(),
  techs: [] as Tech[],
  customers: [] as CustomerRow[],
  stock: new Map<string, number>(), // `${warehouseId}:${sku}` → on hand, mirrors the ledger
};
const stockKey = (warehouseId: string, sku: string) => `${warehouseId}:${sku}`;
const onHand = (warehouseId: string, sku: string) => world.stock.get(stockKey(warehouseId, sku)) ?? 0;
const addStock = (warehouseId: string, sku: string, delta: number) =>
  world.stock.set(stockKey(warehouseId, sku), onHand(warehouseId, sku) + delta);
const opsFor = (city: string) => (world.ops.find((row) => row.cities.includes(city)) ?? world.ops[0]!).userId;
const counters = { photos: 0, signatures: 0, feedback: 0, payments: 0 };

// ---------------------------------------------------------------- setup
async function setup() {
  const existing = await prisma.organization.findFirst({ where: { name: data.organizationName } });
  if (existing) {
    say(`Removing the previous demo organization (${existing.id})…`);
    await deleteOrganization(process.env.DATABASE_URL!, existing.id);
  }
  const demoEmails = [
    data.staff.admin.email,
    ...data.staff.ops.map((row) => row.email),
    ...data.technicians.map((row) => row.email),
    ...data.customers.flatMap((row) => [row.contact, row.secondContact].filter(Boolean).map((name) => `${slug(name!)}@example.com`)),
  ];
  const clash = await prisma.user.findFirst({ where: { email: { in: demoEmails } }, select: { email: true } });
  if (clash) throw new Error(`${clash.email} already exists in another organization; the demo needs its emails free.`);

  const t0 = at(-100, 9, 30);
  setClock(t0);
  clockNow = t0;
  await api("POST", "/auth/register", {
    body: { organizationName: data.organizationName, name: data.staff.admin.name, email: data.staff.admin.email, password: data.demoPassword },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: data.staff.admin.email } });
  world.adminId = admin.id;
  const as = admin.id;
  // Head office in Bengaluru: Karnataka jobs are intra-state (CGST + SGST), the rest IGST.
  await api("PATCH", "/organization", { as, body: { gstState: data.gstState } });

  for (const person of data.staff.ops) {
    await api("POST", "/users/invitations", { as, body: { email: person.email, name: person.name, role: "OPS" } });
    const mail = [...sentMail].reverse().find((message) => message.to === person.email && message.link);
    const token = new URL(mail!.link!).searchParams.get("token")!;
    await api("POST", "/auth/invitations/accept", { body: { token, password: data.demoPassword } });
    const user = await prisma.user.findFirstOrThrow({ where: { email: person.email } });
    world.ops.push({ userId: user.id, cities: person.cities });
  }

  for (const name of data.skills) {
    world.skills.set(name, (await api("POST", "/skills", { as, body: { name } })).data.id);
  }
  for (const area of data.serviceAreas) {
    world.areas.set(area.name, (await api("POST", "/service-areas", { as, body: { name: area.name, postalCodes: area.postalCodes } })).data.id);
  }
  for (const type of data.serviceTypes) {
    const created = await api("POST", "/service-types", {
      as,
      body: {
        name: type.name,
        description: type.description,
        requiredSkillId: world.skills.get(type.skill),
        serviceCharge: type.serviceCharge,
        labourRatePerHour: type.labourRatePerHour,
        sacCode: type.sacCode,
      },
    });
    world.serviceTypes.set(type.key, created.data.id);
  }

  for (const [index, tech] of data.technicians.entries()) {
    const created = await api("POST", "/technicians", {
      as,
      body: { name: tech.name, email: tech.email, password: data.demoPassword, phone: mobile() },
    });
    const id = created.data.id as string;
    await api("PATCH", `/technicians/${id}`, {
      as,
      body: { skillIds: tech.skills.map((name) => world.skills.get(name)!), serviceAreaIds: tech.areas.map((name) => world.areas.get(name)!) },
    });
    const row = await prisma.technician.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    world.techs.push({ ...tech, id, userId: row.userId, vanId: "", index });
  }

  for (const part of data.parts) {
    const created = await api("POST", "/parts", { as, body: { sku: part.sku, name: part.name, unitPrice: part.unitPrice, reorderLevel: part.reorderLevel } });
    world.parts.set(part.sku, { id: created.data.id, price: Number(part.unitPrice) });
  }
  for (const city of Object.keys(data.states) as data.City[]) {
    const store = await api("POST", "/warehouses", { as, body: { name: `${city} Central Store`, kind: "WAREHOUSE" } });
    world.stores.set(city, store.data.id);
  }
  for (const tech of world.techs) {
    const van = await api("POST", "/warehouses", { as, body: { name: `Van ${tech.van} (${tech.name})`, kind: "VAN", technicianId: tech.id } });
    tech.vanId = van.data.id;
  }

  // Opening stock: a purchase order into each city store, then each van loaded for its skills.
  setClock(at(-99, 10, 0));
  const cityScale: Record<data.City, number> = { Bengaluru: 1.4, Mumbai: 1.2, Pune: 0.8, Hyderabad: 0.8 };
  for (const [city, storeId] of world.stores) {
    for (const part of data.parts) {
      const quantity = Math.max(3, Math.round(part.reorderLevel * (2.2 + rng.next() * 1.5) * cityScale[city]));
      await receive(storeId, part.sku, quantity, `PO-${city.slice(0, 3).toUpperCase()}-2026-${String(rng.int(101, 899))} opening stock`);
    }
  }
  setClock(at(-99, 15, 0));
  for (const tech of world.techs) await restockVan(tech, 4, "Van loading for the quarter");

  // Customers, contacts, sites and equipment.
  setClock(at(-98, 10, 0));
  for (const customer of data.customers) {
    const isHome = customer.kind === "home";
    const created = await api("POST", "/customers", {
      as,
      body: {
        name: customer.name,
        phone: isHome ? mobile() : officePhone(customer.city),
        email: isHome ? `${slug(customer.contact)}@example.com` : `facilities.${slug(customer.name).split(".").slice(0, 2).join(".")}@example.com`,
      },
    });
    const customerId = created.data.id as string;
    const area = data.serviceAreas.find((row) => (row.postalCodes as readonly string[]).includes(customer.postalCode))!;
    const address = await api("POST", `/customers/${customerId}/addresses`, {
      as,
      body: {
        label: isHome ? "Home" : "Main site",
        line1: customer.line1,
        line2: customer.line2,
        city: customer.city,
        state: data.states[customer.city],
        postalCode: customer.postalCode,
        isPrimary: true,
      },
    });
    const contactEmail = `${slug(customer.contact)}@example.com`;
    await api("POST", `/customers/${customerId}/contacts`, {
      as,
      body: { name: customer.contact, email: contactEmail, phone: mobile(), password: data.demoPassword },
    });
    if (customer.secondContact) {
      await api("POST", `/customers/${customerId}/contacts`, {
        as,
        body: { name: customer.secondContact, email: `${slug(customer.secondContact)}@example.com`, phone: mobile() },
      });
    }
    const contactUser = await prisma.user.findFirstOrThrow({ where: { email: contactEmail } });
    const row: CustomerRow = {
      ...customer,
      id: customerId,
      addressId: address.data.id,
      area: area.name,
      contactUserId: contactUser.id,
      contactName: customer.contact,
      assets: [],
    };
    const seen = new Map<string, number>();
    for (const key of customer.assets) {
      const kind = data.equipment[key]!;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      const installed = at(-rng.int(120, 2200), 12);
      const warrantyYears = key === "lift" || key === "chiller" ? 2 : rng.pick([1, 1, 2, 3, 5]);
      const warrantyEnds = installed + warrantyYears * 365 * DAY;
      const label = `${kind.type}${customer.assets.filter((k) => k === key).length > 1 ? ` ${count}` : ""}`;
      const asset = await api("POST", "/assets", {
        as,
        body: {
          customerId,
          addressId: row.addressId,
          equipmentType: kind.type,
          model: rng.pick(kind.models),
          serialNumber: `${kind.serialPrefix}-${customer.city.slice(0, 3).toUpperCase()}-${String(rng.int(10000, 99999))}`,
          installedAt: dateOnly(installed),
          warrantyExpiresAt: dateOnly(warrantyEnds),
          status: "ACTIVE",
        },
      });
      row.assets.push({ id: asset.data.id, key, label });
    }
    world.customers.push(row);
  }

  // Technician leave (scheduling avoids it; the API blocks double booking).
  setClock(at(-97, 11, 0));
  for (const leave of timeOffPlan) {
    const tech = world.techs.find((row) => row.name === leave.tech)!;
    await api("POST", `/technicians/${tech.id}/time-off`, {
      as,
      body: { startsAt: iso(at(leave.from, 0)), endsAt: iso(at(leave.to + 1, 0)), reason: leave.reason },
    });
  }
}

const timeOffPlan = [
  { tech: "Imran Pasha", from: -32, to: -28, reason: "Annual leave — family wedding in Mysuru" },
  { tech: "Ganesh More", from: -12, to: -11, reason: "Sick leave" },
  { tech: "Vikram Patil", from: 3, to: 4, reason: "Personal leave — house move" },
  { tech: "Abdul Rahman", from: 8, to: 10, reason: "Annual leave" },
  { tech: "Deepa Shetty", from: -55, to: -53, reason: "Training: VRF commissioning course" },
];

async function receive(warehouseId: string, sku: string, quantity: number, reason: string) {
  await api("POST", "/inventory/receipts", { as: world.adminId, body: { warehouseId, partId: world.parts.get(sku)!.id, quantity, reason } });
  addStock(warehouseId, sku, quantity);
}

async function transfer(from: string, to: string, sku: string, quantity: number, reason: string, as: string) {
  await api("POST", "/inventory/transfers", {
    as,
    body: { fromWarehouseId: from, toWarehouseId: to, partId: world.parts.get(sku)!.id, quantity, reason },
  });
  addStock(from, sku, -quantity);
  addStock(to, sku, quantity);
}

function partsForTech(tech: Tech) {
  const skus = new Set<string>();
  for (const kind of Object.values(data.equipment)) {
    const skillsNeeded = kind.serviceTypes.map((key) => data.serviceTypes.find((row) => row.key === key)!.skill);
    if (skillsNeeded.some((skill) => (tech.skills as readonly string[]).includes(skill))) kind.parts.forEach((sku) => skus.add(sku));
  }
  return [...skus];
}

// Top the van up to `target` of each part it carries, from the city store; reorder the store
// when it runs low (a new purchase order arrives the same day).
async function restockVan(tech: Tech, target: number, reason: string) {
  const storeId = world.stores.get(tech.city)!;
  const as = opsFor(tech.city);
  for (const sku of partsForTech(tech)) {
    const need = target - onHand(tech.vanId, sku);
    if (need <= 0) continue;
    if (onHand(storeId, sku) < need) {
      const part = data.parts.find((row) => row.sku === sku)!;
      await receive(storeId, sku, part.reorderLevel * 3, `PO-${tech.city.slice(0, 3).toUpperCase()}-REORDER-${String(rng.int(1000, 9999))}`);
    }
    await transfer(storeId, tech.vanId, sku, need, reason, as);
  }
}

// ---------------------------------------------------------------- scheduling plan
const busy = new Map<number, [number, number][]>();
function isFree(tech: Tech, start: number, minutes: number) {
  const end = start + minutes * MIN;
  const day = dayOf(start);
  if (timeOffPlan.some((leave) => leave.tech === tech.name && day >= leave.from && day <= leave.to)) return false;
  return !(busy.get(tech.index) ?? []).some(([s, e]) => start < e + 15 * MIN && end > s - 15 * MIN);
}
function reserve(tech: Tech, start: number, minutes: number) {
  const list = busy.get(tech.index) ?? [];
  list.push([start, start + minutes * MIN]);
  busy.set(tech.index, list);
}
function eligible(customer: CustomerRow, typeKey: data.ServiceTypeKey) {
  const skill = data.serviceTypes.find((row) => row.key === typeKey)!.skill;
  return world.techs.filter(
    (tech) => tech.city === customer.city && (tech.skills as readonly string[]).includes(skill) && (tech.areas as readonly string[]).includes(customer.area),
  );
}
// A free (technician, start) on `day`, trying the next working days if that day is full.
function findSlot(candidates: Tech[], day: number, options: { prefer?: Tech; maxDay?: number; minStart?: number } = {}) {
  for (let d = day; d <= Math.min(day + 4, options.maxDay ?? day + 4); d += 1) {
    if (weekday(d) === 0) continue;
    const techs = rng.shuffle([...candidates]);
    if (options.prefer && techs.includes(options.prefer)) techs.unshift(...techs.splice(techs.indexOf(options.prefer), 1));
    for (const tech of techs) {
      for (const slot of rng.shuffle([...SLOTS])) {
        const start = at(d, 0, slot);
        if (options.minStart && start < options.minStart) continue;
        if (isFree(tech, start, VISIT_MINUTES)) {
          reserve(tech, start, VISIT_MINUTES);
          return { tech, start };
        }
      }
    }
  }
  return null;
}

type VisitOutcome = "complete" | "awaiting_parts" | "follow_up";
type InvoicePlan = "draft" | "issue" | "pay" | "partial" | "partial_then_full" | "void" | "customer_online";
type Job = {
  label: string;
  customer: CustomerRow;
  asset: CustomerRow["assets"][number];
  typeKey: data.ServiceTypeKey;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  description: string;
  byCustomer: boolean;
  createdAt: number;
  // filled while running
  requestId?: string;
  workOrderId?: string;
  visitId?: string;
};

function weightedCustomer() {
  return rng.weighted(
    world.customers.map((customer) => {
      const weight =
        customer.name.startsWith("Greenwood") || customer.name.startsWith("Sanjeevani")
          ? 5
          : customer.name.startsWith("Ananya & Vivek")
            ? 4
            : customer.kind === "home"
              ? 1
              : 2;
      return [customer, weight] as const;
    }),
  );
}

function newJob(label: string, customer = weightedCustomer(), assetIndex?: number): Job {
  const asset = assetIndex === undefined ? rng.pick(customer.assets) : customer.assets[assetIndex]!;
  const kind = data.equipment[asset.key]!;
  const typeKey = rng.pick(kind.serviceTypes);
  const description = rng.pick(kind.problems);
  const urgent = /stuck|alarm|risk|burning|not starting|Vaccine/i.test(description);
  const priority = urgent ? "URGENT" : customer.kind === "hospital" || customer.kind === "restaurant" ? "HIGH" : rng.pick(["NORMAL", "NORMAL", "LOW"] as const);
  return { label, customer, asset, typeKey, priority, description: `${asset.label}: ${description}`, byCustomer: rng.chance(0.65), createdAt: 0 };
}

// ---------------------------------------------------------------- job steps
async function createRequest(job: Job) {
  const window = job.createdAt + rng.int(0, 2) * DAY;
  const body = {
    assetId: job.asset.id,
    serviceTypeId: world.serviceTypes.get(job.typeKey),
    description: job.description,
    preferredStart: dateOnly(window),
    preferredEnd: dateOnly(window + rng.int(1, 3) * DAY),
    ...(job.byCustomer ? {} : { priority: job.priority }),
  };
  const created = await api("POST", "/service-requests", { as: job.byCustomer ? job.customer.contactUserId : opsFor(job.customer.city), body });
  job.requestId = created.data.id;
}

async function acceptRequest(job: Job) {
  const accepted = await api("POST", `/service-requests/${job.requestId}/accept`, {
    as: opsFor(job.customer.city),
    body: { priority: job.priority, ...(rng.chance(0.3) ? { note: rng.pick(["Customer prefers a morning slot.", "Call the security desk before arriving.", "Parking available in basement B1."]) } : {}) },
  });
  job.workOrderId = accepted.data.workOrder.id;
}

function latestVisitId(workOrder: { visits: { id: string; status: string }[] }) {
  const scheduled = workOrder.visits.filter((visit) => visit.status === "SCHEDULED");
  return (scheduled.at(-1) ?? workOrder.visits.at(-1))!.id;
}

async function scheduleVisit(job: Job, start: number) {
  const scheduled = await api("POST", `/work-orders/${job.workOrderId}/schedule`, {
    as: opsFor(job.customer.city),
    body: { scheduledStart: iso(start), durationMinutes: VISIT_MINUTES },
  });
  job.visitId = latestVisitId(scheduled.data);
}

type VisitPlan = {
  tech: Tech;
  start: number;
  outcome: VisitOutcome;
  minutes: number;
  partsUsed: string[];
  photo: boolean;
  hold?: "en-route" | "arrive"; // live visits: stop after this step
  enRouteAt?: number;
  arriveAt?: number;
};

// Technician side of one visit, each step at its own time; steps after "now" are not played,
// so visits around the current time stay en route, on site or in progress.
function playVisit(job: Job, visit: VisitPlan, after: (endedAt: number) => void) {
  const tech = visit.tech;
  const enRoute = visit.enRouteAt ?? visit.start - rng.int(15, 35) * MIN;
  const arrive = visit.arriveAt ?? visit.start + rng.int(-5, 15) * MIN;
  const start = arrive + rng.int(5, 12) * MIN;
  const end = start + visit.minutes * MIN;
  const kind = data.equipment[job.asset.key]!;
  const pick = rng.int(0, kind.diagnosis.length - 1);
  later(enRoute, `${job.label} en route`, async () => void (await api("POST", `/visits/${job.visitId}/en-route`, { as: tech.userId })));
  if (visit.hold === "en-route") return;
  later(arrive, `${job.label} arrive`, async () => void (await api("POST", `/visits/${job.visitId}/arrive`, { as: tech.userId })));
  later(arrive + 3 * MIN, `${job.label} diagnosis`, async () => {
    await api("PATCH", `/visits/${job.visitId}/report`, { as: tech.userId, body: { diagnosis: kind.diagnosis[pick] } });
  });
  if (visit.hold === "arrive") return;
  if (visit.outcome !== "complete") {
    const ended = arrive + rng.int(20, 45) * MIN;
    later(ended, `${job.label} unsuccessful`, async () => {
      const sku = rng.pick(kind.parts);
      await api("POST", `/visits/${job.visitId}/unsuccessful`, {
        as: tech.userId,
        body:
          visit.outcome === "awaiting_parts"
            ? { outcome: "AWAITING_PARTS", reason: `${data.parts.find((row) => row.sku === sku)!.name} needed; not on the van.`, partRequests: [{ partId: world.parts.get(sku)!.id, quantity: 1 }] }
            : { outcome: "FOLLOW_UP_REQUIRED", reason: rng.pick(data.followUpReasons) },
      });
      after(ended);
    });
    return;
  }
  later(start, `${job.label} start`, async () => void (await api("POST", `/visits/${job.visitId}/start`, { as: tech.userId })));
  if (visit.photo) {
    later(start + 8 * MIN, `${job.label} photo`, async () => {
      await api("POST", `/visits/${job.visitId}/photos`, { as: tech.userId, png: sitePhoto(counters.photos), fileName: `site-${++counters.photos}.png` });
    });
  }
  visit.partsUsed.forEach((sku, index) => {
    later(start + (15 + index * 5) * MIN, `${job.label} part ${sku}`, async () => {
      if (onHand(tech.vanId, sku) < 1) return; // the van ran dry; the job goes on without it
      const reserved = await api("POST", `/visits/${job.visitId}/parts`, { as: tech.userId, body: { partId: world.parts.get(sku)!.id, quantity: 1 } });
      const row = reserved.data.visits
        .find((v: { id: string }) => v.id === job.visitId)
        .parts.filter((p: { status: string; part?: { id: string }; partId?: string }) => p.status === "RESERVED")
        .at(-1);
      addStock(tech.vanId, sku, -1);
      await api("POST", `/visits/${job.visitId}/parts/${row.id}/consume`, { as: tech.userId });
    });
  });
  if (rng.chance(0.2)) {
    later(start + 20 * MIN, `${job.label} note`, async () => {
      await api("POST", `/work-orders/${job.workOrderId}/notes`, {
        as: tech.userId,
        body: { body: rng.pick(["Advised the customer to clean filters monthly.", "Recommended replacing the unit within a year; quote requested.", "Earthing at the socket is weak; customer informed."]) },
      });
    });
  }
  later(end - 10 * MIN, `${job.label} report`, async () => {
    await api("PATCH", `/visits/${job.visitId}/report`, { as: tech.userId, body: { workPerformed: kind.work[pick] ?? kind.work[0] } });
  });
  later(end - 5 * MIN, `${job.label} signature`, async () => {
    await api("POST", `/visits/${job.visitId}/signature`, {
      as: tech.userId,
      body: { signerName: job.customer.contactName, image: `data:image/png;base64,${signaturePng(counters.signatures++).toString("base64")}` },
    });
  });
  later(end, `${job.label} complete`, async () => {
    await api("POST", `/visits/${job.visitId}/complete`, { as: tech.userId });
    after(end);
  });
}

function partsFor(job: Job) {
  const kind = data.equipment[job.asset.key]!;
  const roll = rng.next();
  if (roll < 0.4) return [];
  if (roll < 0.85) return [rng.pick(kind.parts)];
  return [...new Set([rng.pick(kind.parts), rng.pick(kind.parts)])];
}

function visitPlan(job: Job, tech: Tech, start: number, outcome: VisitOutcome = "complete"): VisitPlan {
  return { tech, start, outcome, minutes: rng.int(40, 110), partsUsed: partsFor(job), photo: rng.chance(0.35) };
}

// Billing after completion, played over the following days.
function playBilling(job: Job, completedAt: number) {
  const age = (NOW - completedAt) / DAY;
  const plan: InvoicePlan =
    age < 2
      ? rng.weighted([["draft", 5], ["issue", 4], ["pay", 1]])
      : age < 16
        ? rng.weighted([["pay", 4], ["customer_online", 1], ["issue", 3], ["partial", 2], ["void", 0.4], ["draft", 0.6]])
        : rng.weighted([["pay", 6], ["customer_online", 1.5], ["partial_then_full", 1], ["issue", 2], ["partial", 1.6], ["void", 0.5]]);
  const ops = opsFor(job.customer.city);
  const issueAt = officeHours(completedAt + rng.int(2, 26) * HOUR);
  if (plan === "draft") {
    // Nothing to collect on a fully covered visit, so the office clears those drafts quickly.
    if (age >= 1) {
      later(issueAt, `${job.label} covered invoice`, async () => {
        const invoice = (await api("GET", `/work-orders/${job.workOrderId}/invoice`, { as: ops })).data;
        if (Number(invoice.total) === 0) await api("POST", `/invoices/${invoice.id}/issue`, { as: ops });
      });
    }
    return;
  }
  let invoiceId = "";
  let total = 0;
  later(issueAt, `${job.label} invoice`, async () => {
    const invoice = (await api("GET", `/work-orders/${job.workOrderId}/invoice`, { as: ops })).data;
    invoiceId = invoice.id;
    if (rng.chance(0.12)) {
      await api("POST", `/invoices/${invoiceId}/lines`, { as: ops, body: { description: rng.pick(["Ladder and safety harness hire", "After-hours call-out", "Disposal of old parts"]), amount: money(rng.pick([350, 500, 750])) } });
    }
    if (rng.chance(0.1) && Number(invoice.total) > 1500) await api("PATCH", `/invoices/${invoiceId}`, { as: ops, body: { discount: money(rng.pick([100, 200, 250])), notes: "Loyalty discount" } });
    const issued = (await api("POST", `/invoices/${invoiceId}/issue`, { as: ops })).data;
    total = Number(issued.total);
    if (issued.status === "PAID") return; // fully covered by warranty or contract
    if (plan === "void") {
      later(issueAt + rng.int(1, 4) * DAY, `${job.label} void`, async () => {
        await api("POST", `/invoices/${invoiceId}/void`, { as: ops, body: { reason: rng.pick(["Raised against the wrong customer site.", "Covered under goodwill after the repeat visit."]) } });
      });
      return;
    }
    if (plan === "issue") return;
    if (plan === "customer_online") {
      later(issueAt + rng.int(4, 120) * HOUR, `${job.label} online payment`, async () => {
        await api("POST", `/invoices/${invoiceId}/pay`, { as: job.customer.contactUserId });
        counters.payments += 1;
      });
      return;
    }
    const method = rng.weighted([["UPI", 5], ["BANK_TRANSFER", 3], ["CARD", 1.5], ["CASH", 1.5]] as const);
    const reference = method === "UPI" ? `UPI/${rng.int(400000000, 499999999)}` : method === "BANK_TRANSFER" ? `NEFT/KVRS${rng.int(100000, 999999)}` : method === "CARD" ? `POS-${rng.int(10000, 99999)}` : undefined;
    const firstAt = issueAt + rng.int(1, 10) * DAY;
    const partial = plan === "partial" || plan === "partial_then_full";
    later(officeHours(firstAt), `${job.label} payment`, async () => {
      const amount = partial ? Math.max(100, Math.round((total * 0.5) / 100) * 100) : total;
      if (amount >= total && partial) return;
      await api("POST", `/invoices/${invoiceId}/payments`, { as: ops, body: { amount: money(amount), method, ...(reference ? { reference } : {}) } });
      counters.payments += 1;
      if (plan === "partial_then_full") {
        later(officeHours(firstAt + rng.int(5, 12) * DAY), `${job.label} balance`, async () => {
          await api("POST", `/invoices/${invoiceId}/payments`, { as: ops, body: { amount: money(total - amount), method: "BANK_TRANSFER", reference: `NEFT/KVRS${rng.int(100000, 999999)}` } });
          counters.payments += 1;
        });
      }
    });
  });
}

function playFeedback(job: Job, completedAt: number) {
  if (!rng.chance(0.6)) return;
  const rating = rng.weighted([[5, 55], [4, 30], [3, 9], [2, 4], [1, 2]] as const);
  const comments = rating >= 4 ? data.feedbackComments.great : rating === 3 ? data.feedbackComments.ok : data.feedbackComments.poor;
  later(completedAt + rng.int(3, 60) * HOUR, `${job.label} feedback`, async () => {
    await api("POST", `/work-orders/${job.workOrderId}/feedback`, {
      as: job.customer.contactUserId,
      body: { rating, satisfied: rating >= 4, ...(rng.chance(0.75) ? { comment: rng.pick(comments) } : {}) },
    });
    counters.feedback += 1;
  });
}

function afterCompletion(job: Job) {
  return (endedAt: number) => {
    playBilling(job, endedAt);
    playFeedback(job, endedAt);
  };
}

type Plan = {
  job: Job;
  first: VisitPlan;
  second?: VisitPlan; // visit two after an unsuccessful visit one
  stopAfterFirst?: boolean; // still waiting for parts / follow-up
  reschedule?: number; // new start for visit one (already reserved)
  rescheduleTech?: Tech;
  decline?: { tech: Tech; start: number }; // the first technician declines, then `first.tech` takes it
  reassignFrom?: Tech;
  cancel?: "only" | "rebook";
  acceptDelay?: number; // future visits: whether the technician has accepted yet
  notAccepted?: boolean;
};

// Office side of a job: request → triage → assign → schedule → technician acceptance, spread
// over the days before the visit, then the visit(s), billing and feedback.
function playPlan(plan: Plan) {
  const { job } = plan;
  const firstStart = plan.decline?.start ?? plan.first.start;
  const latest = Math.min(firstStart, NOW) - 20 * MIN;
  const lead = rng.int(18, 110) * HOUR;
  job.createdAt = Math.min(firstStart - lead, NOW - rng.int(3, 30) * HOUR);
  const span = Math.max(latest - job.createdAt, 2 * HOUR);
  const t = (fraction: number) => clamp(job.createdAt + span * fraction + rng.int(0, 20) * MIN, job.createdAt, latest);
  const ops = opsFor(job.customer.city);
  later(job.createdAt, `${job.label} request`, () => createRequest(job));
  later(t(0.1), `${job.label} triage`, () => acceptRequest(job));
  const firstTech = plan.decline?.tech ?? plan.reassignFrom ?? plan.first.tech;
  later(t(0.2), `${job.label} assign`, async () => void (await api("POST", `/work-orders/${job.workOrderId}/assign`, { as: ops, body: { technicianId: firstTech.id } })));
  if (plan.reassignFrom) {
    later(t(0.24), `${job.label} reassign`, async () => {
      await api("POST", `/work-orders/${job.workOrderId}/reassign`, { as: ops, body: { technicianId: plan.first.tech.id, reason: rng.pick(data.reassignReasons) } });
    });
  }
  later(t(0.3), `${job.label} schedule`, () => scheduleVisit(job, firstStart));
  if (plan.decline) {
    const decline = plan.decline;
    later(t(0.4), `${job.label} decline`, async () => {
      await api("POST", `/work-orders/${job.workOrderId}/decline`, { as: decline.tech.userId, body: { reason: rng.pick(data.declineReasons) } });
    });
    later(t(0.5), `${job.label} reassign after decline`, async () => {
      await api("POST", `/work-orders/${job.workOrderId}/assign`, { as: ops, body: { technicianId: plan.first.tech.id } });
      await scheduleVisit(job, plan.first.start);
    });
  }
  if (!plan.notAccepted) {
    later(t(0.6), `${job.label} technician accepts`, async () => void (await api("POST", `/work-orders/${job.workOrderId}/accept`, { as: plan.first.tech.userId })));
  }
  let visitOne = plan.first;
  if (plan.reschedule) {
    visitOne = { ...plan.first, start: plan.reschedule };
    later(t(0.8), `${job.label} reschedule`, async () => {
      await api("POST", `/visits/${job.visitId}/reschedule`, {
        as: ops,
        body: { scheduledStart: iso(plan.reschedule!), durationMinutes: VISIT_MINUTES, reason: rng.pick(data.rescheduleReasons) },
      });
    });
  }
  if (plan.cancel) {
    const cancelAt = t(0.9);
    later(cancelAt, `${job.label} cancel`, async () => {
      await api("POST", `/visits/${job.visitId}/cancel`, { as: ops, body: { reason: rng.pick(data.cancelReasons) } });
    });
    if (plan.cancel === "only" || !plan.second) return;
    const rebook = plan.second;
    const bookAt = clamp(officeHours(rebook.start - rng.int(20, 60) * HOUR), cancelAt + 30 * MIN, rebook.start - 3 * HOUR);
    later(bookAt, `${job.label} rebook`, () => scheduleVisit(job, rebook.start));
    later(bookAt + HOUR, `${job.label} accept rebooked`, async () => void (await api("POST", `/work-orders/${job.workOrderId}/accept`, { as: rebook.tech.userId })));
    playVisit(job, rebook, afterCompletion(job));
    return;
  }
  playVisit(job, visitOne, (endedAt) => {
    if (visitOne.outcome === "complete") return afterCompletion(job)(endedAt);
    if (plan.stopAfterFirst || !plan.second) return;
    const second = plan.second;
    const fulfilAt = officeHours(endedAt + rng.int(30, 70) * HOUR);
    if (visitOne.outcome === "awaiting_parts") {
      if (fulfilAt > NOW) return;
      later(fulfilAt, `${job.label} parts arrive`, async () => {
        const open = (await api("GET", "/part-requests?status=OPEN", { as: ops })).data.filter((row: { workOrderId?: string; workOrder?: { id: string } }) => (row.workOrderId ?? row.workOrder?.id) === job.workOrderId);
        for (const request of open) {
          await api("POST", `/part-requests/${request.id}/fulfil`, { as: ops, body: { note: "Dispatched from the central store to the technician's van." } });
          const sku = data.parts.find((part) => world.parts.get(part.sku)!.id === (request.partId ?? request.part?.id))?.sku;
          if (sku && onHand(world.stores.get(job.customer.city)!, sku) > 0) {
            await transfer(world.stores.get(job.customer.city)!, second.tech.vanId, sku, 1, `For work order follow-up (${job.customer.name})`, ops);
          }
        }
      });
    }
    const ready = visitOne.outcome === "awaiting_parts" ? fulfilAt + HOUR : endedAt + HOUR;
    const bookAt = clamp(officeHours(ready + rng.int(1, 18) * HOUR), ready, second.start - 3 * HOUR);
    if (bookAt < ready) return; // visit two was planned too early to book; the job keeps waiting
    later(bookAt, `${job.label} book visit two`, () => scheduleVisit(job, second.start));
    later(clamp(bookAt + rng.int(1, 5) * HOUR, bookAt + 10 * MIN, second.start - HOUR), `${job.label} accept visit two`, async () => void (await api("POST", `/work-orders/${job.workOrderId}/accept`, { as: second.tech.userId })));
    playVisit(job, second, afterCompletion(job));
  });
}

// ---------------------------------------------------------------- the plan
function buildPlans() {
  const plans: Plan[] = [];
  const nowDay = dayOf(NOW);
  const demoTech = world.techs.find((tech) => tech.name === "Suresh Kumar")!;
  const bengaluruAc = world.customers.filter((c) => c.city === "Bengaluru" && c.assets.some((a) => a.key === "splitAc" || a.key === "vrf"));

  // Visits happening right now, so the technician app and dashboard show live work.
  const round = Math.floor(NOW / (15 * MIN)) * 15 * MIN;
  const live: [Tech, number, string, VisitPlan["hold"]][] = [
    [demoTech, round - 75 * MIN, "live-in-progress", undefined],
    [world.techs.find((t) => t.name === "Vikram Patil")!, round - 15 * MIN, "live-on-site", "arrive"],
    [world.techs.find((t) => t.name === "Rohit Jadhav")!, round + 30 * MIN, "live-en-route", "en-route"],
  ];
  for (const [tech, start, label, hold] of live) {
    if (!isFree(tech, start, VISIT_MINUTES)) continue;
    const customers = tech === demoTech ? bengaluruAc : world.customers.filter((c) => c.city === tech.city);
    const customer = rng.pick(customers);
    if (!customer) continue;
    const assetIndex = customer.assets.findIndex((a) => eligible(customer, data.equipment[a.key]!.serviceTypes[0]!).includes(tech));
    if (assetIndex < 0) continue;
    const job = newJob(label, customer, assetIndex);
    job.typeKey = data.equipment[job.asset.key]!.serviceTypes[0]!;
    reserve(tech, start, VISIT_MINUTES);
    const visit = { ...visitPlan(job, tech, start), hold, minutes: 180 }; // still running
    if (hold === "en-route") visit.enRouteAt = NOW - 10 * MIN;
    if (hold === "arrive") {
      visit.enRouteAt = start - 40 * MIN;
      visit.arriveAt = NOW - 8 * MIN;
    }
    plans.push({ job, first: visit });
  }

  const pickJob = (day: number, label: string, prefer?: Tech) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const job = newJob(label);
      const slot = findSlot(eligible(job.customer, job.typeKey), day, { prefer, maxDay: day < weekStart ? Math.min(day + 3, weekStart - 1) : day + 2 });
      if (slot) return { job, slot };
    }
    return null;
  };

  let serial = 0;
  let forcedAwaiting = 0;
  let forcedFollowUp = 0;
  for (let day = -85; day <= 14; day += 1) {
    if (weekday(day) === 0) continue;
    const inWeek = day >= weekStart && day <= weekStart + 5;
    const count = inWeek ? 8 : day < weekStart ? rng.weighted([[0, 3], [1, 4], [2, 3], [3, 1]] as const) : rng.int(1, 2);
    for (let i = 0; i < count; i += 1) {
      const picked = pickJob(day, `job-${++serial}`, day === nowDay && i < 2 ? demoTech : undefined);
      if (!picked) continue;
      const { job, slot } = picked;
      const plan: Plan = { job, first: visitPlan(job, slot.tech, slot.start) };
      const past = slot.start + 4 * HOUR < NOW;
      const upcoming = slot.start - 40 * MIN > NOW;
      if (past) {
        const recent = NOW - slot.start < 8 * DAY;
        // Make sure the board always shows jobs still waiting for parts or a follow-up visit.
        const forced = recent ? (forcedAwaiting < 3 ? "awaiting" : forcedFollowUp < 2 ? "follow" : null) : null;
        const roll = forced === "awaiting" ? 0 : forced === "follow" ? 0.1 : rng.next();
        if (forced === "awaiting") forcedAwaiting += 1;
        if (forced === "follow") forcedFollowUp += 1;
        const second = (gap: number) => {
          const next = findSlot([slot.tech, ...eligible(job.customer, job.typeKey)], dayOf(slot.start) + gap, { prefer: slot.tech });
          return next ? visitPlan(job, next.tech, next.start) : undefined;
        };
        if (roll < 0.08) {
          plan.first.outcome = "awaiting_parts";
          plan.second = second(rng.int(4, 6));
          plan.stopAfterFirst = forced === "awaiting" || (recent && rng.chance(0.6));
        } else if (roll < 0.14) {
          plan.first.outcome = "follow_up";
          plan.second = second(rng.int(2, 4));
          plan.stopAfterFirst = forced === "follow" || (recent && rng.chance(0.5));
        } else if (roll < 0.19) {
          plan.cancel = rng.chance(0.5) ? "only" : "rebook";
          if (plan.cancel === "rebook") plan.second = second(rng.int(2, 4));
        }
      }
      if (upcoming) plan.notAccepted = rng.chance(0.3);
      if (!plan.cancel && rng.chance(0.1) && !(slot.start < NOW && slot.start > NOW - 4 * HOUR)) {
        // Rescheduled once before it happened: the original slot is the plan's first start.
        const moved = findSlot([slot.tech], dayOf(slot.start) + 1, { maxDay: dayOf(slot.start) + 3 });
        const bothPast = moved && moved.start + 4 * HOUR < NOW && past;
        if (moved && (bothPast || upcoming)) {
          plan.reschedule = moved.start;
        }
      }
      if (!plan.reschedule && !plan.cancel && rng.chance(0.05)) {
        const other = eligible(job.customer, job.typeKey).filter((tech) => tech !== slot.tech);
        if (other.length) plan.reassignFrom = rng.pick(other);
      }
      if (!plan.reschedule && !plan.cancel && !plan.reassignFrom && rng.chance(0.04)) {
        const other = eligible(job.customer, job.typeKey).filter((tech) => tech !== slot.tech && isFree(tech, slot.start - DAY, VISIT_MINUTES));
        if (other.length) {
          const decliner = rng.pick(other);
          const start = slot.start - DAY;
          reserve(decliner, start, VISIT_MINUTES);
          plan.decline = { tech: decliner, start };
        }
      }
      plans.push(plan);
    }
  }
  return plans;
}

// Requests that never reached a visit: new, waiting for information, rejected, or triaged into
// work orders not yet assigned or not yet scheduled.
function playBacklog() {
  const make = (label: string, createdAt: number) => {
    const job = newJob(label);
    job.createdAt = createdAt;
    later(createdAt, `${label} request`, () => createRequest(job));
    return job;
  };
  for (let i = 0; i < 9; i += 1) make(`new-${i}`, NOW - rng.int(1, 70) * HOUR);
  for (let i = 0; i < 4; i += 1) {
    const job = make(`info-${i}`, NOW - rng.int(30, 120) * HOUR);
    const ask = officeHours(job.createdAt + rng.int(1, 5) * HOUR);
    later(ask, `info-${i} ask`, async () => {
      await api("POST", `/service-requests/${job.requestId}/request-info`, { as: opsFor(job.customer.city), body: { message: rng.pick(data.needInfoMessages) } });
    });
    if (i < 2) {
      later(ask + rng.int(2, 20) * HOUR, `info-${i} reply`, async () => {
        await api("POST", `/service-requests/${job.requestId}/reply`, { as: job.customer.contactUserId, body: { message: rng.pick(data.customerReplies) } });
      });
    }
  }
  for (let i = 0; i < 7; i += 1) {
    const job = make(`rejected-${i}`, at(-rng.int(2, 80), rng.int(8, 20), rng.int(0, 59)));
    later(officeHours(job.createdAt + rng.int(1, 8) * HOUR), `rejected-${i} reject`, async () => {
      await api("POST", `/service-requests/${job.requestId}/reject`, { as: opsFor(job.customer.city), body: { reason: rng.pick(data.rejectReasons) } });
    });
  }
  for (let i = 0; i < 9; i += 1) {
    const job = make(`open-${i}`, NOW - rng.int(4, 96) * HOUR);
    const triage = Math.min(officeHours(job.createdAt + rng.int(1, 4) * HOUR), NOW - 30 * MIN);
    later(triage, `open-${i} triage`, () => acceptRequest(job));
    if (i >= 5) {
      const tech = eligible(job.customer, job.typeKey)[0];
      if (tech) later(triage + 20 * MIN, `open-${i} assign`, async () => void (await api("POST", `/work-orders/${job.workOrderId}/assign`, { as: opsFor(job.customer.city), body: { technicianId: tech.id } })));
    }
  }
}

// AMCs with included visits, and preventive-maintenance plans that open work orders themselves.
const contractPlan = [
  { customer: "Greenwood Heights", name: "Lift & DG Comprehensive AMC 2026–27", assets: ["lift", "dg", "firePump"], start: -160, end: 205, visits: 12, cover: [100, 100, 25] },
  { customer: "Sanjeevani", name: "Critical Systems AMC — HVAC, power and cold chain", assets: ["chiller", "vrf", "dg", "ups", "medicalFridge"], start: -130, end: 235, visits: 24, cover: [100, 100, 50] },
  { customer: "Arogya Heart", name: "HVAC & Power AMC", assets: ["chiller", "vrf", "dg", "ups"], start: -200, end: 165, visits: 18, cover: [100, 100, 30] },
  { customer: "Sea Breeze", name: "Lift AMC (non-comprehensive)", assets: ["lift"], start: -110, end: 255, visits: 6, cover: [100, 50, 0] },
  { customer: "Riverside Greens", name: "Society Maintenance AMC", assets: ["lift", "dg", "pump", "firePump"], start: -95, end: 270, visits: 12, cover: [100, 100, 20] },
  { customer: "Infinity IT Park", name: "Facility AMC FY 2025–26 extension", assets: ["chiller", "ups", "dg", "lift"], start: -345, end: 20, visits: 12, cover: [100, 100, 40] },
  { customer: "Nizam Care", name: "Hospital Engineering AMC", assets: ["chiller", "dg", "ups", "medicalFridge", "lift"], start: -60, end: 305, visits: 18, cover: [100, 100, 50] },
  { customer: "Lotus Pond", name: "Lift & Fire Safety AMC", assets: ["lift", "firePump"], start: -150, end: 215, visits: null, cover: [100, 100, 0] },
  { customer: "Meridian", name: "Lift & UPS AMC", assets: ["lift", "ups"], start: -120, end: 245, visits: 8, cover: [100, 100, 0], cancelAt: -20 },
] as const;

const planTypes: Partial<Record<keyof typeof data.equipment, { type: data.ServiceTypeKey; every: number; lead: number; name: string }>> = {
  lift: { type: "lift-pm", every: 30, lead: 5, name: "Monthly lift preventive maintenance" },
  dg: { type: "dg", every: 90, lead: 7, name: "Quarterly DG service (250 h)" },
  chiller: { type: "hvac", every: 60, lead: 7, name: "Bi-monthly chiller maintenance" },
  firePump: { type: "fire", every: 90, lead: 10, name: "Quarterly fire system inspection" },
  ups: { type: "electrical", every: 120, lead: 7, name: "UPS battery health check" },
};

const planAssets = new Map<string, { customer: CustomerRow; assetIndex: number; typeKey: data.ServiceTypeKey }>();

async function setupContracts() {
  setClock(at(-96, 11, 0));
  for (const contract of contractPlan) {
    const customer = world.customers.find((row) => row.name.startsWith(contract.customer))!;
    const assets = customer.assets.filter((asset) => (contract.assets as readonly string[]).includes(asset.key));
    const created = await api("POST", "/contracts", {
      as: opsFor(customer.city),
      body: {
        customerId: customer.id,
        name: contract.name,
        startsOn: dateOnly(at(contract.start, 12)),
        endsOn: dateOnly(at(contract.end, 12)),
        assetIds: assets.map((asset) => asset.id),
        serviceChargeCoveredPercent: contract.cover[0],
        labourCoveredPercent: contract.cover[1],
        partsCoveredPercent: contract.cover[2],
        ...(contract.visits ? { includedVisits: contract.visits } : {}),
      },
    });
    const contractId = created.data.id as string;
    assets.forEach((asset) => (asset.contract = contractId));
    if ("cancelAt" in contract) {
      later(at(contract.cancelAt, 15, 30), `cancel ${contract.name}`, async () => {
        await api("POST", `/contracts/${contractId}/cancel`, { as: opsFor(customer.city), body: { reason: "Building management changed vendor at renewal." } });
      });
      continue;
    }
    for (const asset of assets) {
      const kind = planTypes[asset.key];
      if (!kind || (asset.key === "lift" && asset.label.endsWith("2"))) continue;
      const plan = await api("POST", "/maintenance-plans", {
        as: opsFor(customer.city),
        body: {
          assetId: asset.id,
          serviceTypeId: world.serviceTypes.get(kind.type),
          contractId,
          name: `${kind.name} — ${asset.label}`,
          intervalDays: kind.every,
          leadDays: kind.lead,
          firstDueOn: dateOnly(at(-rng.int(60, 88) + (kind.every > 60 ? rng.int(0, 30) : 0), 12)),
        },
      });
      planAssets.set(plan.data.id, { customer, assetIndex: customer.assets.indexOf(asset), typeKey: kind.type });
    }
  }
}

// Every Monday morning the maintenance run opens due work orders; ops then plans them.
function playMaintenanceRuns() {
  for (let day = -88; day <= dayOf(NOW); day += 1) {
    if (weekday(day) !== 1 && day !== dayOf(NOW)) continue;
    later(at(day, 7, 0), `maintenance run day ${day}`, async () => {
      const generated = (await api("POST", "/maintenance-plans/run", { as: world.ops[0]!.userId })).data as { requestId: string; workOrderId: string }[];
      // The run returns plans in database order, which differs between runs; walk them in the
      // order the plans were created here so the random stream is consumed the same way each time.
      const planOrder = [...planAssets.keys()];
      const rows = await Promise.all(
        generated.map(async (row) => ({
          ...row,
          planId: (await prisma.workOrder.findUniqueOrThrow({ where: { id: row.workOrderId }, select: { maintenancePlanId: true } })).maintenancePlanId!,
        })),
      );
      rows.sort((a, b) => planOrder.indexOf(a.planId) - planOrder.indexOf(b.planId));
      for (const row of rows) {
        const info = planAssets.get(row.planId);
        if (!info) continue;
        const job = newJob(`pm-${row.workOrderId.slice(-5)}`, info.customer, info.assetIndex);
        job.typeKey = info.typeKey;
        job.requestId = row.requestId;
        job.workOrderId = row.workOrderId;
        const assignAt = officeHours(at(day, 7, 0) + rng.int(2, 6) * HOUR);
        const slot = findSlot(eligible(info.customer, info.typeKey), day + rng.int(1, 5), { minStart: assignAt + 3 * HOUR });
        if (!slot) continue;
        const ops = opsFor(info.customer.city);
        later(assignAt, `${job.label} assign`, async () => {
          await api("POST", `/work-orders/${job.workOrderId}/assign`, { as: ops, body: { technicianId: slot.tech.id } });
          await scheduleVisit(job, slot.start);
        });
        later(clamp(assignAt + rng.int(1, 8) * HOUR, assignAt + 10 * MIN, slot.start - HOUR), `${job.label} accept`, async () => {
          await api("POST", `/work-orders/${job.workOrderId}/accept`, { as: slot.tech.userId });
        });
        playVisit(job, visitPlan(job, slot.tech, slot.start), afterCompletion(job));
      }
    });
  }
}

// Weekly van top-ups on Saturday evenings.
function playRestocks() {
  for (let day = -84; day <= dayOf(NOW); day += 1) {
    if (weekday(day) !== 6) continue;
    later(at(day, 18, 0), `restock day ${day}`, async () => {
      for (const tech of world.techs) await restockVan(tech, 3, "Weekly van top-up");
    });
  }
}

// ---------------------------------------------------------------- run
const started = realNow();
say(`Demo seed: ${data.organizationName}, anchor ${anchorDate} (IST), seed ${process.env.DEMO_SEED ?? 20261008}`);
try {
  await setup();
  await setupContracts();
  const plans = buildPlans();
  plans.forEach(playPlan);
  playBacklog();
  playMaintenanceRuns();
  playRestocks();
  say(`Replaying ${queue.length}+ timed actions for ${plans.length} visit jobs…`);
  let done = 0;
  while (queue.length > 0) {
    const event = queue.shift()!;
    clockNow = event.at;
    setClock(event.at);
    try {
      await event.run();
    } catch (error) {
      throw new Error(`While playing "${event.label}" at ${iso(event.at)}: ${(error as Error).message}`);
    }
    done += 1;
    if (process.env.DEMO_TRACE) appendFileSync(process.env.DEMO_TRACE, `${done}\t${event.label}\t${iso(event.at)}\t${simulatedNow() - event.at}\t${rng.snapshot()}\n`);
    if (done % 500 === 0) say(`  …${done} actions, at ${istDate(event.at)}`);
  }

  // Back to the present: overdue sweep, notification sweeps, and staff catching up on their inbox.
  setClock(null);
  const ops = world.ops[0]!.userId;
  await api("POST", "/invoices/mark-overdue", { as: ops });
  await api("POST", "/notifications/sweep", { as: ops });
  const readers = [world.adminId, ...world.ops.map((row) => row.userId), ...world.techs.map((row) => row.userId), ...world.customers.map((row) => row.contactUserId)];
  for (const userId of readers) {
    const inbox = (await api("GET", "/notifications", { as: userId })).data as { id: string; readAt: string | null; createdAt: string }[];
    for (const row of inbox.filter((item) => !item.readAt && Date.parse(item.createdAt) < realNow() - 2 * DAY)) {
      await api("POST", `/notifications/${row.id}/read`, { as: userId });
    }
  }
  say(`Done in ${Math.round((realNow() - started) / 1000)} s (${done} timed actions).`);
  await printCounts();
} finally {
  server.close();
  await prisma.$disconnect();
}

async function printCounts() {
  const organization = await prisma.organization.findFirstOrThrow({ where: { name: data.organizationName } });
  const where = { organizationId: organization.id };
  const group = async (rows: Promise<{ status: string; _count: { _all: number } }[]>) =>
    Object.fromEntries((await rows).map((row) => [row.status, row._count._all] as const).sort(([a], [b]) => a.localeCompare(b)));
  const counts = {
    users: await prisma.user.count({ where }),
    customers: await prisma.customer.count({ where }),
    contacts: await prisma.customerContact.count({ where: { customer: where } }),
    addresses: await prisma.address.count({ where: { customer: where } }),
    assets: await prisma.asset.count({ where }),
    technicians: await prisma.technician.count({ where }),
    timeOff: await prisma.technicianTimeOff.count({ where }),
    parts: await prisma.part.count({ where }),
    warehouses: await prisma.warehouse.count({ where }),
    stockMovements: await prisma.stockMovement.count({ where }),
    serviceRequests: await group(prisma.serviceRequest.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    workOrders: await group(prisma.workOrder.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    visits: await group(prisma.serviceVisit.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    visitChanges: await prisma.visitChange.count({ where }),
    invoices: await group(prisma.invoice.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    partiallyPaid: await prisma.invoice.count({ where: { ...where, status: { in: ["ISSUED", "OVERDUE"] }, amountPaid: { gt: 0 } } }),
    intraStateInvoices: await prisma.invoice.count({ where: { ...where, cgst: { gt: 0 } } }),
    interStateInvoices: await prisma.invoice.count({ where: { ...where, igst: { gt: 0 } } }),
    payments: await prisma.payment.count({ where }),
    contracts: await group(prisma.serviceContract.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    contractVisits: await prisma.contractVisit.count({ where }),
    maintenancePlans: await prisma.maintenancePlan.count({ where }),
    partRequests: await group(prisma.partRequest.groupBy({ by: ["status"], where, _count: { _all: true } }) as never),
    feedback: await prisma.feedback.count({ where }),
    notifications: await prisma.notification.count({ where }),
    auditEvents: await prisma.auditEvent.count({ where }),
    photos: await prisma.visitPhoto.count({ where }),
  };
  say(JSON.stringify(counts, null, 2));
}
