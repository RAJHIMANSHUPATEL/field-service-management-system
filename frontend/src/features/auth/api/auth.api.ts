import { api, setAccessToken } from "@/lib/apiClient";
import type { LoginInput } from "../schemas/login.schema";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPS" | "TECHNICIAN" | "CUSTOMER";
  organization: {
    id: string;
    name: string;
  };
};

export const authKeys = {
  me: ["auth", "me"] as const,
};

export async function login(input: LoginInput): Promise<AuthUser> {
  const result = await api<{ data: { accessToken: string; user: AuthUser } }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
    skipRefresh: true,
  });
  setAccessToken(result.data.accessToken);
  return result.data.user;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const result = await api<{ data: AuthUser }>("/api/v1/auth/me");
  return result.data;
}

export async function logout(): Promise<void> {
  try {
    await api<void>("/api/v1/auth/logout", {
      method: "POST",
      skipRefresh: true,
    });
  } finally {
    setAccessToken(null);
  }
}
