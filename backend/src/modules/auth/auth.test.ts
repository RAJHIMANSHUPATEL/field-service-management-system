import argon2 from "argon2";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app } from "../../server.js";
import { resetDatabase } from "../../test/resetDatabase.js";
import { REFRESH_GRACE_WINDOW_MS } from "./auth.service.js";
import { openToken } from "./sealedToken.js";
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

afterEach(() => {
  vi.useRealTimers();
});

// Only Date is faked, so the database driver's own timers keep running.
function freezeClock(at = new Date("2026-10-08T09:00:00.000Z")) {
  vi.useFakeTimers({ toFake: ["Date"], now: at });
  return {
    advance(ms: number) {
      vi.setSystemTime(new Date(Date.now() + ms));
    },
  };
}

function refreshWithCookie(cookie: string) {
  return request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);
}

function refreshWithBody(refreshToken: string) {
  return request(app).post("/api/v1/auth/refresh").set("X-Client", "mobile").send({ refreshToken });
}

async function waitFor(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the condition");
}

async function loginAs(email: string) {
  await createUser("TECHNICIAN", email);
  return request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
}

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

  it("rotates the refresh token and rejects reuse after the grace window", async () => {
    const clock = freezeClock();
    await createUser("TECHNICIAN", "tech@example.com");

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "tech@example.com",
      password: "Password123!",
    });
    const firstCookie = refreshCookie(loginResponse.headers["set-cookie"]);

    const refreshResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.accessToken).toEqual(expect.any(String));

    clock.advance(REFRESH_GRACE_WINDOW_MS);
    const reusedResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(reusedResponse.status).toBe(401);
    expect(reusedResponse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const secondCookie = refreshCookie(refreshResponse.headers["set-cookie"]);
    const familyRevoked = await request(app).post("/api/v1/auth/refresh").set("Cookie", secondCookie);
    expect(familyRevoked.status).toBe(401);
    expect(familyRevoked.body.error.code).toBe("REFRESH_TOKEN_REUSED");
  });

  describe("refresh grace window", () => {
    it("uses a window of about ten seconds", () => {
      expect(REFRESH_GRACE_WINDOW_MS).toBe(10_000);
    });

    it("returns the same successor to a retry inside the window and keeps the family usable", async () => {
      freezeClock();
      const login = await loginAs("grace@example.com");
      const first = refreshCookie(login.headers["set-cookie"]);

      const rotated = await refreshWithCookie(first);
      expect(rotated.status).toBe(200);
      const successor = refreshCookie(rotated.headers["set-cookie"]);

      // The browser reloaded before it stored the new cookie, so it sends the old one again.
      const retried = await refreshWithCookie(first);
      expect(retried.status).toBe(200);
      expect(refreshCookie(retried.headers["set-cookie"])).toBe(successor);
      expect(retried.body.data.accessToken).toEqual(expect.any(String));
      const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${retried.body.data.accessToken}`);
      expect(me.body.data.email).toBe("grace@example.com");

      const next = await refreshWithCookie(successor);
      expect(next.status).toBe(200);
      expect(refreshCookie(next.headers["set-cookie"])).not.toBe(successor);
      expect(await prisma.refreshToken.count()).toBe(3);
    });

    it("returns the same successor in the body for mobile clients", async () => {
      freezeClock();
      await createUser("TECHNICIAN", "grace-mobile@example.com");
      const login = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client", "mobile")
        .send({ email: "grace-mobile@example.com", password: "Password123!" });
      const first = login.body.data.refreshToken as string;

      const rotated = await refreshWithBody(first);
      const retried = await refreshWithBody(first);
      expect(retried.status).toBe(200);
      expect(retried.body.data.refreshToken).toBe(rotated.body.data.refreshToken);
      expect((await refreshWithBody(rotated.body.data.refreshToken)).status).toBe(200);
    });

    it("serves a retry up to the last millisecond of the window, then treats it as reuse", async () => {
      const clock = freezeClock();
      const login = await loginAs("late@example.com");
      const first = refreshCookie(login.headers["set-cookie"]);
      const rotated = await refreshWithCookie(first);
      const successor = refreshCookie(rotated.headers["set-cookie"]);

      clock.advance(REFRESH_GRACE_WINDOW_MS - 1);
      const lastMoment = await refreshWithCookie(first);
      expect(lastMoment.status).toBe(200);
      expect(refreshCookie(lastMoment.headers["set-cookie"])).toBe(successor);

      clock.advance(1);
      const late = await refreshWithCookie(first);
      expect(late.status).toBe(401);
      expect(late.body.error.code).toBe("REFRESH_TOKEN_REUSED");

      const successorAfter = await refreshWithCookie(successor);
      expect(successorAfter.status).toBe(401);
      expect(successorAfter.body.error.code).toBe("REFRESH_TOKEN_REUSED");
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      expect(await prisma.refreshToken.count({ where: { successorSecret: { not: null } } })).toBe(0);
    });

    it("treats a retry as reuse once the successor has itself been rotated", async () => {
      freezeClock();
      const login = await loginAs("rotated-twice@example.com");
      const first = refreshCookie(login.headers["set-cookie"]);
      const second = refreshCookie((await refreshWithCookie(first)).headers["set-cookie"]);
      const third = refreshCookie((await refreshWithCookie(second)).headers["set-cookie"]);

      const stale = await refreshWithCookie(first);
      expect(stale.status).toBe(401);
      expect(stale.body.error.code).toBe("REFRESH_TOKEN_REUSED");
      expect(stale.headers["set-cookie"]).toBeUndefined();

      const newest = await refreshWithCookie(third);
      expect(newest.status).toBe(401);
      expect(newest.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    });

    it("treats a retry as reuse once the successor has been logged out", async () => {
      freezeClock();
      await createUser("TECHNICIAN", "logged-out@example.com");
      const login = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client", "mobile")
        .send({ email: "logged-out@example.com", password: "Password123!" });
      const first = login.body.data.refreshToken as string;
      const successor = (await refreshWithBody(first)).body.data.refreshToken as string;
      expect((await request(app).post("/api/v1/auth/logout").send({ refreshToken: successor })).status).toBe(204);

      const retried = await refreshWithBody(first);
      expect(retried.status).toBe(401);
      expect(retried.body.error.code).toBe("REFRESH_TOKEN_REUSED");
      expect(retried.body.data).toBeUndefined();
    });

    it("gives concurrent refreshes of one token a single shared successor", async () => {
      freezeClock();
      const login = await loginAs("concurrent@example.com");
      const first = refreshCookie(login.headers["set-cookie"]);
      const token = await prisma.refreshToken.findFirstOrThrow();

      // Hold the token's row lock so both refreshes read it as live and then queue on their
      // conditional update; releasing the lock lets exactly one of them rotate it.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "RefreshToken" WHERE id = ${token.id} FOR UPDATE`;
          await released;
        },
        { timeout: 15_000 },
      );
      const racing = [refreshWithCookie(first).then((r) => r), refreshWithCookie(first).then((r) => r)];
      await waitFor(async () => {
        const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        return (row?.waiting ?? 0) >= 2;
      });
      release();
      await holder;
      const responses = await Promise.all(racing);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const cookies = new Set(responses.map((response) => refreshCookie(response.headers["set-cookie"])));
      expect(cookies.size).toBe(1);
      expect(await prisma.refreshToken.count()).toBe(2);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
    });

    it("stores the successor only sealed, and drops it after the window", async () => {
      const clock = freezeClock();
      const login = await loginAs("sealed@example.com");
      const first = refreshCookie(login.headers["set-cookie"]);
      const rotated = await refreshWithCookie(first);
      const successor = refreshCookie(rotated.headers["set-cookie"]).slice("refreshToken=".length);

      const [original] = await prisma.refreshToken.findMany({ where: { revokedAt: { not: null } } });
      expect(original?.graceUntil?.getTime()).toBe(Date.now() + REFRESH_GRACE_WINDOW_MS);
      expect(original?.successorSecret).toEqual(expect.stringMatching(/^v1\./));
      expect(original?.successorSecret).not.toContain(successor);

      // Sealed for this row only: it opens here and nowhere else.
      expect(openToken(original!.successorSecret!, original!.id)).toBe(successor);
      expect(openToken(original!.successorSecret!, original!.successorId!)).toBeNull();

      clock.advance(REFRESH_GRACE_WINDOW_MS);
      expect((await refreshWithCookie(`refreshToken=${successor}`)).status).toBe(200);
      const cleared = await prisma.refreshToken.findUniqueOrThrow({ where: { id: original!.id } });
      expect(cleared).toMatchObject({ graceUntil: null, successorId: null, successorSecret: null });
    });
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
