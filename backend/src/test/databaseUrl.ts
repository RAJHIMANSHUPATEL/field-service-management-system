import { config } from "dotenv";

config();

export function databaseUrlWithName(databaseName: string): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export const testDatabaseUrl = databaseUrlWithName("field_service_test");
