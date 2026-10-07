import type { InvitationStatus } from "../../generated/prisma/client.js";

// PENDING → ACCEPTED (the invitee sets a password) or PENDING → REVOKED (an admin withdraws it).
export const invitationTransitions: Record<InvitationStatus, InvitationStatus[]> = {
  PENDING: ["ACCEPTED", "REVOKED"],
  ACCEPTED: [],
  REVOKED: [],
};

export function canMoveInvitation(from: InvitationStatus, to: InvitationStatus) {
  return invitationTransitions[from].includes(to);
}
