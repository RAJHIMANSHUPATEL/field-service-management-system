import { Navigate, Outlet } from "react-router-dom";
import type { AuthUser } from "@/features/auth/api/auth.api";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

export function RequireRole({ roles }: { roles: AuthUser["role"][] }) {
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
