import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import type { Role } from "../../generated/prisma/client.js";

let passwordHash: string;

async function createUser(role: Role, email: string) {
  const organization = await prisma.organization.create({
    data: { name: `Org ${email}` },
  });

  return prisma.user.create({
    data: {
      organizationId: organization.id,
      email,
      name: email,
      role,
      passwordHash,
    },
  });
}

function refreshCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
  if (!header) {
    throw new Error("Missing refresh cookie");
  }
  const match = /refreshToken=([^;]+)/.exec(header);
  if (!match?.[1]) {
    throw new Error("Missing refresh cookie");
  }
  return `refreshToken=${match[1]}`;
}

beforeAll(async () => {
  passwordHash = await argon2.hash("Password123!");
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth", () => {
  it("rejects a bad password", async () => {
    await createUser("ADMIN", "admin@example.com");

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
      },
    });
  });

  it("logs in and returns the current user", async () => {
    await createUser("OPS", "ops@example.com");

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "ops@example.com",
      password: "Password123!",
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.user).toMatchObject({
      email: "ops@example.com",
      role: "OPS",
    });
    expect(loginResponse.body.data.accessToken).toEqual(expect.any(String));

    const meResponse = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.email).toBe("ops@example.com");
  });

  it("rotates the refresh token and rejects reuse", async () => {
    await createUser("TECHNICIAN", "tech@example.com");

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "tech@example.com",
      password: "Password123!",
    });
    const firstCookie = refreshCookie(loginResponse.headers["set-cookie"]);

    const refreshResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.accessToken).toEqual(expect.any(String));

    const reusedResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(reusedResponse.status).toBe(401);
    expect(reusedResponse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const secondCookie = refreshCookie(refreshResponse.headers["set-cookie"]);
    const familyRevoked = await request(app).post("/api/v1/auth/refresh").set("Cookie", secondCookie);
    expect(familyRevoked.status).toBe(401);
    expect(familyRevoked.body.error.code).toBe("REFRESH_TOKEN_REUSED");
  });

  it("rejects a technician from the admin route", async () => {
    await createUser("TECHNICIAN", "tech-guard@example.com");
    await createUser("ADMIN", "admin-guard@example.com");

    const technicianLogin = await request(app).post("/api/v1/auth/login").send({
      email: "tech-guard@example.com",
      password: "Password123!",
    });
    const forbidden = await request(app)
      .get("/api/v1/admin/ping")
      .set("Authorization", `Bearer ${technicianLogin.body.data.accessToken}`);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");

    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: "admin-guard@example.com",
      password: "Password123!",
    });
    const allowed = await request(app)
      .get("/api/v1/admin/ping")
      .set("Authorization", `Bearer ${adminLogin.body.data.accessToken}`);

    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ data: { ok: true } });
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});
