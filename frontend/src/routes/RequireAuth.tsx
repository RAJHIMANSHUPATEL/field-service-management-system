import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

export function RequireAuth() {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Checking your session...</p>;
  }

  if (!currentUser.data) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
