import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "./databaseUrl.js";

async function ensureDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("Unexpected database name");
  }
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${databaseName}"`);
  }
  await client.end();
}

export default async function setup() {
  await ensureDatabase(testDatabaseUrl);
  execSync("npx prisma migrate deploy --config prisma7.config.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
