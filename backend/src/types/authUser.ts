import type { Role } from "../generated/prisma/client.js";

export type AuthUser = {
  id: string;
  organizationId: string;
  role: Role;
  email: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
