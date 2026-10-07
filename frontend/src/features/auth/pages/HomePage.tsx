import { Navigate } from "react-router-dom";
import { DashboardPage } from "@/features/analytics/pages/DashboardPage";
import { useCurrentUser } from "../hooks/useCurrentUser";

export function HomePage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  if (user.role === "CUSTOMER") {
    return <Navigate to="/equipment" replace />;
  }

  if (user.role === "TECHNICIAN") {
    return <Navigate to="/my-jobs" replace />;
  }

  return <DashboardPage />;
}
