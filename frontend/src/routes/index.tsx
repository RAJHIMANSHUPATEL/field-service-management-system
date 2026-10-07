import { createBrowserRouter } from "react-router-dom";
import { HomePage } from "@/features/auth/pages/HomePage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { EquipmentPage } from "@/features/customers/pages/EquipmentPage";
import { RequestDetailPage } from "@/features/serviceRequests/pages/RequestDetailPage";
import { RequestsPage } from "@/features/serviceRequests/pages/RequestsPage";
import { ServiceTypesPage } from "@/features/serviceTypes/pages/ServiceTypesPage";
import { TechnicianProfilePage } from "@/features/technicians/pages/TechnicianProfilePage";
import { TechniciansPage } from "@/features/technicians/pages/TechniciansPage";
import { WorkOrderDetailPage } from "@/features/workOrders/pages/WorkOrderDetailPage";
import { WorkOrdersPage } from "@/features/workOrders/pages/WorkOrdersPage";
import { AppShell } from "./AppShell";
import { NotReadyPage } from "./NotReadyPage";
import { RequireAuth } from "./RequireAuth";
import { RequireRole } from "./RequireRole";
import { UnknownRoute } from "./UnknownRoute";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequireRole roles={["ADMIN", "OPS"]} />,
            children: [
              { path: "customers", element: <CustomersPage /> },
              { path: "customers/:customerId", element: <CustomerDetailPage /> },
              { path: "service-types", element: <ServiceTypesPage /> },
              { path: "technicians", element: <TechniciansPage /> },
              { path: "schedule", element: <NotReadyPage /> },
              { path: "assets", element: <NotReadyPage /> },
              { path: "inventory", element: <NotReadyPage /> },
              { path: "invoices", element: <NotReadyPage /> },
              { path: "contracts", element: <NotReadyPage /> },
              { path: "analytics", element: <NotReadyPage /> },
              { path: "notifications", element: <NotReadyPage /> },
              { path: "users", element: <NotReadyPage /> },
              { path: "master", element: <NotReadyPage /> },
              { path: "audit", element: <NotReadyPage /> },
            ],
          },
          {
            element: <RequireRole roles={["ADMIN", "OPS", "CUSTOMER"]} />,
            children: [
              { path: "requests", element: <RequestsPage /> },
              { path: "requests/:requestId", element: <RequestDetailPage /> },
            ],
          },
          {
            element: <RequireRole roles={["ADMIN", "OPS", "TECHNICIAN"]} />,
            children: [
              { path: "work-orders", element: <WorkOrdersPage /> },
              { path: "work-orders/:workOrderId", element: <WorkOrderDetailPage /> },
            ],
          },
          {
            element: <RequireRole roles={["CUSTOMER"]} />,
            children: [{ path: "equipment", element: <EquipmentPage /> }],
          },
          {
            element: <RequireRole roles={["TECHNICIAN"]} />,
            children: [{ path: "profile", element: <TechnicianProfilePage /> }],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <UnknownRoute />,
  },
]);
