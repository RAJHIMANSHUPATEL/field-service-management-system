import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "../../generated/prisma/client.js";
import { sentMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";

const password = "Password123!";
let passwordHash: string;
let organizationId: string;

async function login(email: string, pass = password) {
  return request(app).post("/api/v1/auth/login").send({ email, password: pass });
}

async function token(email: string) {
  const response = await login(email);
  expect(response.status).toBe(200);
  return { Authorization: `Bearer ${response.body.data.accessToken as string}` };
}

async function addUser(role: Role, email: string, orgId = organizationId) {
  return prisma.user.create({ data: { organizationId: orgId, email, name: email, role, passwordHash } });
}

function tokenFrom(link: string | undefined) {
  return new URL(link ?? "").searchParams.get("token") ?? "";
}

beforeAll(async () => {
  passwordHash = await argon2.hash(password);
});

beforeEach(async () => {
  await resetDatabase();
  sentMail.length = 0;
  const organization = await prisma.organization.create({ data: { name: "Users Co" } });
  organizationId = organization.id;
  await addUser("ADMIN", "admin@example.com");
  await addUser("OPS", "ops@example.com");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("invitations", () => {
  it("lets an admin invite ops, and the invitee sets a password and signs in", async () => {
    const admin = await token("admin@example.com");
    const invited = await request(app)
      .post("/api/v1/users/invitations")
      .set(admin)
      .send({ email: "Nina@Example.com", name: "Nina", role: "OPS" });
    expect(invited.status).toBe(201);
    expect(invited.body.data.status).toBe("PENDING");
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]?.to).toBe("nina@example.com");

    const accepted = await request(app)
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFrom(sentMail[0]?.link), password: "NewPassword1!" });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.user.role).toBe("OPS");
    expect((await login("nina@example.com", "NewPassword1!")).status).toBe(200);

    const again = await request(app)
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFrom(sentMail[0]?.link), password: "NewPassword1!" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVALID_TRANSITION");

    const users = await request(app).get("/api/v1/users").set(admin);
    expect(users.body.data.map((u: { email: string }) => u.email)).toContain("nina@example.com");
  });

  it("rejects accepting a revoked invitation and revoking twice", async () => {
    const admin = await token("admin@example.com");
    const invited = await request(app)
      .post("/api/v1/users/invitations")
      .set(admin)
      .send({ email: "rex@example.com", name: "Rex", role: "ADMIN" });
    const id = invited.body.data.id as string;
    const revoked = await request(app).post(`/api/v1/users/invitations/${id}/revoke`).set(admin);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.status).toBe("REVOKED");

    const twice = await request(app).post(`/api/v1/users/invitations/${id}/revoke`).set(admin);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("INVALID_TRANSITION");

    const accepted = await request(app)
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFrom(sentMail[0]?.link), password: "NewPassword1!" });
    expect(accepted.status).toBe(409);
    expect(accepted.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects a bad token, a duplicate email, a non-staff role, and non-admins", async () => {
    const admin = await token("admin@example.com");
    const bad = await request(app).post("/api/v1/auth/invitations/accept").send({ token: "nope", password: "NewPassword1!" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("TOKEN_INVALID");

    const duplicate = await request(app)
      .post("/api/v1/users/invitations")
      .set(admin)
      .send({ email: "ops@example.com", name: "Ops", role: "OPS" });
    expect(duplicate.status).toBe(409);

    const technician = await request(app)
      .post("/api/v1/users/invitations")
      .set(admin)
      .send({ email: "t@example.com", name: "T", role: "TECHNICIAN" });
    expect(technician.status).toBe(400);

    const ops = await token("ops@example.com");
    const forbidden = await request(app)
      .post("/api/v1/users/invitations")
      .set(ops)
      .send({ email: "x@example.com", name: "X", role: "OPS" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
    expect((await request(app).get("/api/v1/users").set(ops)).status).toBe(403);
  });

  it("hides another organization's invitation", async () => {
    const other = await prisma.organization.create({ data: { name: "Other Co" } });
    await addUser("ADMIN", "other-admin@example.com", other.id);
    const admin = await token("admin@example.com");
    const invited = await request(app)
      .post("/api/v1/users/invitations")
      .set(admin)
      .send({ email: "zed@example.com", name: "Zed", role: "OPS" });
    const otherAdmin = await token("other-admin@example.com");
    const revoke = await request(app)
      .post(`/api/v1/users/invitations/${invited.body.data.id as string}/revoke`)
      .set(otherAdmin);
    expect(revoke.status).toBe(404);
    expect(revoke.body.error.code).toBe("INVITATION_NOT_FOUND");
  });
});

describe("password reset", () => {
  it("resets the password once and signs out other sessions", async () => {
    const before = await login("ops@example.com");
    const cookie = String(before.headers["set-cookie"]);
    const requested = await request(app).post("/api/v1/auth/password-reset/request").send({ email: "ops@example.com" });
    expect(requested.status).toBe(202);
    expect(sentMail).toHaveLength(1);

    const reset = await request(app)
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token: tokenFrom(sentMail[0]?.link), password: "Changed123!" });
    expect(reset.status).toBe(200);
    expect((await login("ops@example.com")).status).toBe(401);
    expect((await login("ops@example.com", "Changed123!")).status).toBe(200);

    const refresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie.split(";")[0] ?? "");
    expect(refresh.status).toBe(401);

    const reused = await request(app)
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token: tokenFrom(sentMail[0]?.link), password: "Again12345!" });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("answers the same for an unknown email and rejects a bad token", async () => {
    const requested = await request(app).post("/api/v1/auth/password-reset/request").send({ email: "who@example.com" });
    expect(requested.status).toBe(202);
    expect(sentMail).toHaveLength(0);
    const bad = await request(app).post("/api/v1/auth/password-reset/confirm").send({ token: "bad", password: "Changed123!" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("TOKEN_INVALID");
  });
});
