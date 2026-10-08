import { z } from "zod";
import * as analyticsController from "../modules/analytics/analytics.controller.js";
import * as assetController from "../modules/assets/asset.controller.js";
import * as auditEventController from "../modules/auditEvents/auditEvent.controller.js";
import * as authController from "../modules/auth/auth.controller.js";
import * as contractController from "../modules/contracts/contract.controller.js";
import * as customerController from "../modules/customers/customer.controller.js";
import * as feedbackController from "../modules/feedback/feedback.controller.js";
import * as inventoryController from "../modules/inventory/inventory.controller.js";
import * as invoiceController from "../modules/invoices/invoice.controller.js";
import * as maintenanceController from "../modules/maintenance/maintenance.controller.js";
import * as notificationController from "../modules/notifications/notification.controller.js";
import * as partRequestController from "../modules/partRequests/partRequest.controller.js";
import * as partController from "../modules/parts/part.controller.js";
import * as serviceAreaController from "../modules/serviceAreas/serviceArea.controller.js";
import * as serviceRequestController from "../modules/serviceRequests/serviceRequest.controller.js";
import * as serviceTypeController from "../modules/serviceTypes/serviceType.controller.js";
import * as skillController from "../modules/skills/skill.controller.js";
import * as organizationController from "../modules/organization/organization.controller.js";
import { updateOrganizationSchema } from "../modules/organization/organization.schema.js";
import * as technicianController from "../modules/technicians/technician.controller.js";
import * as userController from "../modules/users/user.controller.js";
import * as visitController from "../modules/visits/visit.controller.js";
import * as warehouseController from "../modules/warehouses/warehouse.controller.js";
import * as workOrderController from "../modules/workOrders/workOrder.controller.js";
import { periodQuerySchema } from "../modules/analytics/analytics.schema.js";
import { createAssetSchema, listAssetsQuerySchema, updateAssetSchema } from "../modules/assets/asset.schema.js";
import { listAuditEventsQuerySchema } from "../modules/auditEvents/auditEvent.schema.js";
import { acceptInvitationSchema, confirmPasswordResetSchema, loginSchema, refreshSchema, registerOrganizationSchema, requestPasswordResetSchema } from "../modules/auth/auth.schema.js";
import { cancelContractSchema, createContractSchema, listContractsQuerySchema } from "../modules/contracts/contract.schema.js";
import { createAddressSchema, createContactSchema, createCustomerSchema, listCustomersQuerySchema, updateAddressSchema, updateContactSchema, updateCustomerSchema } from "../modules/customers/customer.schema.js";
import { createFeedbackSchema, listFeedbackQuerySchema } from "../modules/feedback/feedback.schema.js";
import { addVisitPartSchema, adjustmentSchema, movementQuerySchema, receiptSchema, returnVisitPartSchema, stockQuerySchema, transferSchema } from "../modules/inventory/inventory.schema.js";
import { addLineSchema, creditNoteSchema, listInvoicesQuerySchema, recordPaymentSchema, refundSchema, updateInvoiceSchema, voidInvoiceSchema } from "../modules/invoices/invoice.schema.js";
import { createPlanSchema, listPlansQuerySchema, updatePlanSchema } from "../modules/maintenance/maintenance.schema.js";
import { listDeliveriesQuerySchema, updateRuleSchema } from "../modules/notifications/notification.schema.js";
import { listPartRequestsQuerySchema, resolvePartRequestSchema } from "../modules/partRequests/partRequest.schema.js";
import { createPartSchema, listPartsQuerySchema, updatePartSchema } from "../modules/parts/part.schema.js";
import { createServiceAreaSchema, listServiceAreasQuerySchema, updateServiceAreaSchema } from "../modules/serviceAreas/serviceArea.schema.js";
import { acceptServiceRequestSchema, createServiceRequestSchema, listServiceRequestsQuerySchema, messageSchema, reasonSchema } from "../modules/serviceRequests/serviceRequest.schema.js";
import { pageQuerySchema } from "../lib/pagination.js";
import { createServiceTypeSchema, updateServiceTypeSchema } from "../modules/serviceTypes/serviceType.schema.js";
import { createSkillSchema, listSkillsQuerySchema, updateSkillSchema } from "../modules/skills/skill.schema.js";
import { createTechnicianSchema, createTimeOffSchema, updateTechnicianSchema } from "../modules/technicians/technician.schema.js";
import { createInvitationSchema, listUsersQuerySchema } from "../modules/users/user.schema.js";
import { calendarQuerySchema, cancelVisitSchema, rescheduleVisitSchema, signatureSchema, unsuccessfulVisitSchema, visitReportSchema } from "../modules/visits/visit.schema.js";
import { createWarehouseSchema, listWarehousesQuerySchema, updateWarehouseSchema } from "../modules/warehouses/warehouse.schema.js";
import { addNoteSchema, assignWorkOrderSchema, candidatesQuerySchema, declineWorkOrderSchema, listWorkOrdersQuerySchema, reassignWorkOrderSchema, scheduleWorkOrderSchema } from "../modules/workOrders/workOrder.schema.js";

// produces: a binary success body instead of JSON. conflict: a GET that can answer 409 (a document
// that is not available in the record's current state).
// created: answers 201 rather than 200.
type Schemas = { body?: z.ZodType; query?: z.ZodType; produces?: string; conflict?: boolean; created?: boolean };

// Request schemas by controller function: the same Zod schemas the controllers parse with.
export const requestSchemas = new Map<unknown, Schemas>([
  [analyticsController.technicians, { query: periodQuerySchema }],
  [assetController.list, { query: listAssetsQuerySchema }],
  [assetController.create, { body: createAssetSchema }],
  [assetController.update, { body: updateAssetSchema }],
  [auditEventController.list, { query: listAuditEventsQuerySchema }],
  [authController.login, { body: loginSchema }],
  [authController.refresh, { body: refreshSchema }],
  [authController.logout, { body: refreshSchema }],
  [authController.requestPasswordReset, { body: requestPasswordResetSchema }],
  [authController.confirmPasswordReset, { body: confirmPasswordResetSchema }],
  [authController.acceptInvitation, { body: acceptInvitationSchema }],
  [authController.registerOrganization, { body: registerOrganizationSchema }],
  [contractController.list, { query: listContractsQuerySchema }],
  [contractController.create, { body: createContractSchema }],
  [contractController.cancel, { body: cancelContractSchema }],
  [customerController.list, { query: listCustomersQuerySchema }],
  [customerController.create, { body: createCustomerSchema }],
  [customerController.update, { body: updateCustomerSchema }],
  [customerController.createContact, { body: createContactSchema }],
  [customerController.updateContact, { body: updateContactSchema }],
  [customerController.createAddress, { body: createAddressSchema }],
  [customerController.updateAddress, { body: updateAddressSchema }],
  [feedbackController.create, { body: createFeedbackSchema }],
  [feedbackController.list, { query: listFeedbackQuerySchema }],
  [inventoryController.stock, { query: stockQuerySchema }],
  [inventoryController.movements, { query: movementQuerySchema }],
  [inventoryController.receive, { body: receiptSchema }],
  [inventoryController.transfer, { body: transferSchema }],
  [inventoryController.adjust, { body: adjustmentSchema }],
  [inventoryController.addVisitPart, { body: addVisitPartSchema }],
  [inventoryController.returnVisitPart, { body: returnVisitPartSchema }],
  [invoiceController.pdf, { produces: "application/pdf", conflict: true }],
  [invoiceController.creditNote, { body: creditNoteSchema, created: true }],
  [invoiceController.refund, { body: refundSchema, created: true }],
  [invoiceController.list, { query: listInvoicesQuerySchema }],
  [invoiceController.update, { body: updateInvoiceSchema }],
  [invoiceController.addLine, { body: addLineSchema }],
  [invoiceController.recordPayment, { body: recordPaymentSchema }],
  [invoiceController.voidInvoice, { body: voidInvoiceSchema }],
  [maintenanceController.list, { query: listPlansQuerySchema }],
  [maintenanceController.create, { body: createPlanSchema }],
  [maintenanceController.update, { body: updatePlanSchema }],
  [notificationController.deliveries, { query: listDeliveriesQuerySchema }],
  [notificationController.updateRule, { body: updateRuleSchema }],
  [partRequestController.list, { query: listPartRequestsQuerySchema, body: resolvePartRequestSchema }],
  [partController.list, { query: listPartsQuerySchema }],
  [partController.create, { body: createPartSchema }],
  [partController.update, { body: updatePartSchema }],
  [serviceAreaController.list, { query: listServiceAreasQuerySchema }],
  [serviceAreaController.create, { body: createServiceAreaSchema }],
  [serviceAreaController.update, { body: updateServiceAreaSchema }],
  [serviceRequestController.list, { query: listServiceRequestsQuerySchema }],
  [serviceRequestController.create, { body: createServiceRequestSchema }],
  [serviceRequestController.accept, { body: acceptServiceRequestSchema }],
  [serviceRequestController.reject, { body: reasonSchema }],
  [serviceRequestController.requestInfo, { body: messageSchema }],
  [serviceRequestController.reply, { body: messageSchema }],
  [serviceTypeController.list, { query: pageQuerySchema }],
  [serviceTypeController.create, { body: createServiceTypeSchema }],
  [serviceTypeController.update, { body: updateServiceTypeSchema }],
  [organizationController.update, { body: updateOrganizationSchema }],
  [skillController.list, { query: listSkillsQuerySchema }],
  [skillController.create, { body: createSkillSchema }],
  [skillController.update, { body: updateSkillSchema }],
  [technicianController.list, { query: pageQuerySchema }],
  [technicianController.create, { body: createTechnicianSchema }],
  [technicianController.update, { body: updateTechnicianSchema }],
  [technicianController.addTimeOff, { body: createTimeOffSchema }],
  [userController.list, { query: listUsersQuerySchema }],
  [userController.listInvitations, { query: listUsersQuerySchema }],
  [userController.invite, { body: createInvitationSchema }],
  [visitController.reschedule, { body: rescheduleVisitSchema }],
  [visitController.cancel, { body: cancelVisitSchema }],
  [visitController.calendar, { query: calendarQuerySchema }],
  [visitController.report, { body: visitReportSchema }],
  [visitController.signature, { body: signatureSchema }],
  [visitController.unsuccessful, { body: unsuccessfulVisitSchema }],
  [warehouseController.list, { query: listWarehousesQuerySchema }],
  [warehouseController.create, { body: createWarehouseSchema }],
  [warehouseController.update, { body: updateWarehouseSchema }],
  [workOrderController.report, { produces: "application/pdf", conflict: true }],
  [workOrderController.list, { query: listWorkOrdersQuerySchema }],
  [workOrderController.assign, { body: assignWorkOrderSchema }],
  [workOrderController.schedule, { body: scheduleWorkOrderSchema }],
  [workOrderController.decline, { body: declineWorkOrderSchema }],
  [workOrderController.reassign, { body: reassignWorkOrderSchema }],
  [workOrderController.candidates, { query: candidatesQuerySchema }],
  [workOrderController.addNote, { body: addNoteSchema }],
]);
