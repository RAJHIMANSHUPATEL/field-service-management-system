import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";

const password = "Password123!";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(organizationName: string, email: string) {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ organizationName, name: "Owner", email, password });
  expect(response.status).toBe(201);
  return { Authorization: `Bearer ${response.body.data.accessToken as string}` };
}

describe("company setup from an empty database", () => {
  it("lets a new admin set up the whole company", async () => {
    expect(await prisma.organization.count()).toBe(0);
    const admin = await register("Cool Air Ltd", "owner@coolair.example");

    const serviceType = await request(app).post("/api/v1/service-types").set(admin).send({ name: "AC repair" });
    expect(serviceType.status).toBe(201);
    const skill = await request(app).post("/api/v1/skills").set(admin).send({ name: "Refrigerant handling" });
    expect(skill.status).toBe(201);
    const area = await request(app)
      .post("/api/v1/service-areas")
      .set(admin)
      .send({ name: "Austin central", postalCodes: ["78701", "78702"] });
    expect(area.status).toBe(201);
    expect(area.body.data.postalCodes).toEqual(["78701", "78702"]);
    const part = await request(app)
      .post("/api/v1/parts")
      .set(admin)
      .send({ sku: "cap-35", name: "Capacitor 35uF", unitPrice: "1250.50", currency: "inr" });
    expect(part.status).toBe(201);
    expect(part.body.data.sku).toBe("CAP-35");
    expect(part.body.data.unitPrice).toBe("1250.5");
    expect(part.body.data.currency).toBe("INR");
    const warehouse = await request(app).post("/api/v1/warehouses").set(admin).send({ name: "Main store" });
    expect(warehouse.status).toBe(201);
    expect(warehouse.body.data.kind).toBe("WAREHOUSE");

    const technician = await request(app)
      .post("/api/v1/technicians")
      .set(admin)
      .send({ name: "Tara", email: "tara@coolair.example", password });
    const technicianId = technician.body.data.id as string;
    const equipped = await request(app)
      .patch(`/api/v1/technicians/${technicianId}`)
      .set(admin)
      .send({ skillIds: [skill.body.data.id], serviceAreaIds: [area.body.data.id] });
    expect(equipped.status).toBe(200);
    expect(equipped.body.data.skills[0].skill.name).toBe("Refrigerant handling");
    expect(equipped.body.data.serviceAreas[0].serviceArea.name).toBe("Austin central");
    const van = await request(app)
      .post("/api/v1/warehouses")
      .set(admin)
      .send({ name: "Tara's van", kind: "VAN", technicianId });
    expect(van.status).toBe(201);

    const customer = await request(app).post("/api/v1/customers").set(admin).send({ name: "ABC Apartments" });
    const customerId = customer.body.data.id as string;
    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(admin)
      .send({ label: "Tower A", line1: "1 Main", city: "Austin", state: "TX", postalCode: "78701" });
    const asset = await request(app).post("/api/v1/assets").set(admin).send({
      customerId,
      addressId: address.body.data.id,
      equipmentType: "Split AC",
      model: "Cool 2T",
      serialNumber: "AC-1",
      warrantyExpiresAt: "2027-12-31",
    });
    expect(asset.status).toBe(201);
    expect(asset.body.data.warrantyExpiresAt).toBe("2027-12-31T00:00:00.000Z");
    const contact = await request(app)
      .post(`/api/v1/customers/${customerId}/contacts`)
      .set(admin)
      .send({ name: "Cara", email: "cara@abc.example", password });
    expect(contact.status).toBe(201);

    for (const email of ["tara@coolair.example", "cara@abc.example"]) {
      const login = await request(app).post("/api/v1/auth/login").send({ email, password });
      expect(login.status).toBe(200);
    }
  });

  it("rejects duplicates, bad van setups, wrong roles, and other organizations", async () => {
    const admin = await register("One Co", "one@example.com");
    await request(app).post("/api/v1/parts").set(admin).send({ sku: "P1", name: "Part", unitPrice: "10" });
    const dupe = await request(app).post("/api/v1/parts").set(admin).send({ sku: "p1", name: "Again", unitPrice: "10" });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe("PART_EXISTS");
    const badPrice = await request(app).post("/api/v1/parts").set(admin).send({ sku: "P2", name: "X", unitPrice: "1.234" });
    expect(badPrice.status).toBe(400);

    const vanless = await request(app).post("/api/v1/warehouses").set(admin).send({ name: "Van", kind: "VAN" });
    expect(vanless.status).toBe(400);
    const technician = await request(app)
      .post("/api/v1/technicians")
      .set(admin)
      .send({ name: "T", email: "t@one.example", password });
    const technicianId = technician.body.data.id as string;
    expect(
      (await request(app).post("/api/v1/warehouses").set(admin).send({ name: "Van 1", kind: "VAN", technicianId })).status,
    ).toBe(201);
    const second = await request(app).post("/api/v1/warehouses").set(admin).send({ name: "Van 2", kind: "VAN", technicianId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("VAN_EXISTS");

    const technicianLogin = await request(app).post("/api/v1/auth/login").send({ email: "t@one.example", password });
    const technicianAuth = { Authorization: `Bearer ${technicianLogin.body.data.accessToken as string}` };
    const forbidden = await request(app).post("/api/v1/skills").set(technicianAuth).send({ name: "X" });
    expect(forbidden.status).toBe(403);
    expect((await request(app).get("/api/v1/skills").set(technicianAuth)).status).toBe(403);
    expect((await request(app).get("/api/v1/parts").set(technicianAuth)).status).toBe(200);

    const skill = await request(app).post("/api/v1/skills").set(admin).send({ name: "Wiring" });
    const other = await register("Two Co", "two@example.com");
    const hidden = await request(app).get(`/api/v1/skills/${skill.body.data.id as string}`).set(other);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("SKILL_NOT_FOUND");
    const otherTech = await request(app)
      .post("/api/v1/technicians")
      .set(other)
      .send({ name: "U", email: "u@two.example", password });
    const crossOrg = await request(app)
      .patch(`/api/v1/technicians/${otherTech.body.data.id as string}`)
      .set(other)
      .send({ skillIds: [skill.body.data.id] });
    expect(crossOrg.status).toBe(404);
    expect(crossOrg.body.error.code).toBe("SKILL_NOT_FOUND");

    const takenEmail = await request(app)
      .post("/api/v1/auth/register")
      .send({ organizationName: "Three", name: "X", email: "one@example.com", password });
    expect(takenEmail.status).toBe(409);
  });
});
