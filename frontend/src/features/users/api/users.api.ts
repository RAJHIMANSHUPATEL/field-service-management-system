import { api, setAccessToken } from "@/lib/apiClient";
import type { AuthUser } from "@/features/auth/api/auth.api";
import type { PageMeta } from "@/features/customers/api/customers.api";
import type { InviteInput } from "../schemas/user.schema";

export type UserRow = { id: string; email: string; name: string; role: AuthUser["role"]; createdAt: string };
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";
export type Invitation = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPS";
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
};

export const userKeys = {
  all: ["users"] as const,
  invitations: ["users", "invitations"] as const,
};

export async function listUsers() {
  return (await api<{ data: UserRow[]; meta: PageMeta }>("/api/v1/users?limit=100")).data;
}

export async function listInvitations() {
  return (await api<{ data: Invitation[]; meta: PageMeta }>("/api/v1/users/invitations?limit=100")).data;
}

export async function inviteUser(input: InviteInput) {
  return (await api<{ data: Invitation }>("/api/v1/users/invitations", { method: "POST", body: JSON.stringify(input) }))
    .data;
}

export async function revokeInvitation(id: string) {
  return (await api<{ data: Invitation }>(`/api/v1/users/invitations/${id}/revoke`, { method: "POST" })).data;
}

export async function acceptInvitation(token: string, password: string) {
  const result = await api<{ data: { accessToken: string; user: AuthUser } }>("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token, password }),
    skipRefresh: true,
  });
  setAccessToken(result.data.accessToken);
  return result.data.user;
}

export async function requestPasswordReset(email: string) {
  await api("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
    skipRefresh: true,
  });
}

export async function confirmPasswordReset(token: string, password: string) {
  await api("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, password }),
    skipRefresh: true,
  });
}
