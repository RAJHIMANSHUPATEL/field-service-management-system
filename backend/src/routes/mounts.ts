import type { Router } from "express";
import { syncRouter } from "../modules/sync/sync.routes.js";
import { auditEventRouter } from "../modules/auditEvents/auditEvent.routes.js";
import { userRouter } from "../modules/users/user.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { assetRouter } from "../modules/assets/asset.routes.js";
import { customerRouter } from "../modules/customers/customer.routes.js";
import { serviceRequestRouter } from "../modules/serviceRequests/serviceRequest.routes.js";
import { serviceTypeRouter } from "../modules/serviceTypes/serviceType.routes.js";
import { technicianRouter } from "../modules/technicians/technician.routes.js";
import { workOrderRouter } from "../modules/workOrders/workOrder.routes.js";
import { visitRouter } from "../modules/visits/visit.routes.js";
import { skillRouter } from "../modules/skills/skill.routes.js";
import { serviceAreaRouter } from "../modules/serviceAreas/serviceArea.routes.js";
import { partRouter } from "../modules/parts/part.routes.js";
import { contractRouter } from "../modules/contracts/contract.routes.js";
import { invoiceRouter } from "../modules/invoices/invoice.routes.js";
import { partRequestRouter } from "../modules/partRequests/partRequest.routes.js";
import { inventoryRouter } from "../modules/inventory/inventory.routes.js";
import { feedbackRouter } from "../modules/feedback/feedback.routes.js";
import { notificationRouter } from "../modules/notifications/notification.routes.js";
import { maintenanceRouter } from "../modules/maintenance/maintenance.routes.js";
import { analyticsRouter } from "../modules/analytics/analytics.routes.js";
import { warehouseRouter } from "../modules/warehouses/warehouse.routes.js";
import { organizationRouter } from "../modules/organization/organization.routes.js";

// Every API router and where it is mounted. The server and the OpenAPI document both read this,
// so the documentation cannot miss a route.
export const mounts: [string, Router][] = [
  ["/api/v1/auth", authRouter],
  ["/api/v1/organization", organizationRouter],
  ["/api/v1/sync", syncRouter],
  ["/api/v1/customers", customerRouter],
  ["/api/v1/assets", assetRouter],
  ["/api/v1/service-types", serviceTypeRouter],
  ["/api/v1/service-requests", serviceRequestRouter],
  ["/api/v1/technicians", technicianRouter],
  ["/api/v1/work-orders", workOrderRouter],
  ["/api/v1/visits", visitRouter],
  ["/api/v1/users", userRouter],
  ["/api/v1/skills", skillRouter],
  ["/api/v1/service-areas", serviceAreaRouter],
  ["/api/v1/parts", partRouter],
  ["/api/v1/warehouses", warehouseRouter],
  ["/api/v1/inventory", inventoryRouter],
  ["/api/v1/part-requests", partRequestRouter],
  ["/api/v1/contracts", contractRouter],
  ["/api/v1/invoices", invoiceRouter],
  ["/api/v1/maintenance-plans", maintenanceRouter],
  ["/api/v1/feedback", feedbackRouter],
  ["/api/v1/analytics", analyticsRouter],
  ["/api/v1/notifications", notificationRouter],
  ["/api/v1/audit-events", auditEventRouter],
];
