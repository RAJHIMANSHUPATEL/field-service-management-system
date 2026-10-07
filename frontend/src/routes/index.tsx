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
import { InvoiceDetailPage } from "@/features/invoices/pages/InvoiceDetailPage";
import { InvoicesPage } from "@/features/invoices/pages/InvoicesPage";
import { InventoryPage } from "@/features/inventory/pages/InventoryPage";
import { MyJobsPage } from "@/features/workOrders/pages/MyJobsPage";
import { WorkOrdersPage } from "@/features/workOrders/pages/WorkOrdersPage";
import { AuditLogPage } from "@/features/auditEvents/pages/AuditLogPage";
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage } from "@/features/users/pages/PublicAuthPages";
import { UsersPage } from "@/features/users/pages/UsersPage";
import { MasterDataPage } from "@/features/masterData/pages/MasterDataPage";
import { RegisterPage } from "@/features/masterData/pages/RegisterPage";
import { AssetsPage } from "@/features/assets/pages/AssetsPage";
import { SchedulePage } from "@/features/schedule/pages/SchedulePage";
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
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/accept-invite", element: <AcceptInvitePage /> },
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
              { path: "assets", element: <AssetsPage /> },
              { path: "inventory", element: <InventoryPage /> },
              { path: "contracts", element: <NotReadyPage /> },
              { path: "analytics", element: <NotReadyPage /> },
              { path: "notifications", element: <NotReadyPage /> },
              { path: "master", element: <MasterDataPage /> },
            ],
          },
          {
            element: <RequireRole roles={["ADMIN"]} />,
            children: [
              { path: "users", element: <UsersPage /> },
              { path: "audit", element: <AuditLogPage /> },
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
              { path: "schedule", element: <SchedulePage /> },
            ],
          },
          {
            element: <RequireRole roles={["TECHNICIAN"]} />,
            children: [{ path: "my-jobs", element: <MyJobsPage /> }],
          },
          {
            element: <RequireRole roles={["ADMIN", "OPS", "CUSTOMER"]} />,
            children: [
              { path: "invoices", element: <InvoicesPage /> },
              { path: "invoices/:invoiceId", element: <InvoiceDetailPage /> },
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
