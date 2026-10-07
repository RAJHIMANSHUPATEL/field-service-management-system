import type { NotificationAudience, NotificationChannel } from "../../generated/prisma/client.js";

export type CatalogEntry = {
  event: string;
  audience: NotificationAudience;
  channels: NotificationChannel[];
  subject: string;
  body: string;
};

// Every event in requirements section 17, with its audience and default channels. Each org gets
// these as NotificationRule rows it can change; code only says which event happened.
export const notificationCatalog: CatalogEntry[] = [
  // Customer
  { event: "request.received", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL"], subject: "We received your request", body: "Your request for {{equipment}} is in. We will review it shortly." },
  { event: "request.accepted", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL"], subject: "Your request was accepted", body: "We accepted your request for {{equipment}} and opened a job." },
  { event: "technician.assigned", audience: "CUSTOMER", channels: ["IN_APP"], subject: "Technician assigned", body: "{{technician}} will handle your {{equipment}}." },
  { event: "appointment.confirmed", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL", "SMS"], subject: "Appointment confirmed", body: "{{technician}} will visit on {{when}}." },
  { event: "visit.en_route", audience: "CUSTOMER", channels: ["IN_APP", "SMS"], subject: "Technician on the way", body: "{{technician}} is on the way." },
  { event: "visit.arrived", audience: "CUSTOMER", channels: ["IN_APP"], subject: "Technician arrived", body: "{{technician}} has arrived." },
  { event: "service.completed", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL"], subject: "Service completed", body: "The work on your {{equipment}} is complete. Tell us how it went." },
  { event: "invoice.generated", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL"], subject: "Invoice {{invoiceNumber}}", body: "Invoice {{invoiceNumber}} for {{amount}} is ready." },
  { event: "payment.received", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL"], subject: "Payment received", body: "We received {{amount}} for invoice {{invoiceNumber}}. Thank you." },
  { event: "appointment.rescheduled", audience: "CUSTOMER", channels: ["IN_APP", "EMAIL", "SMS"], subject: "Appointment rescheduled", body: "Your visit moved to {{when}}. Reason: {{reason}}" },
  // Technician
  { event: "job.assigned", audience: "TECHNICIAN", channels: ["IN_APP", "SMS"], subject: "New job assigned", body: "{{customer}} · {{equipment}}." },
  { event: "assignment.changed", audience: "TECHNICIAN", channels: ["IN_APP"], subject: "Assignment changed", body: "The job for {{customer}} was moved to another technician. Reason: {{reason}}" },
  { event: "appointment.changed", audience: "TECHNICIAN", channels: ["IN_APP", "SMS"], subject: "Appointment changed", body: "The visit for {{customer}} moved to {{when}}." },
  { event: "job.cancelled", audience: "TECHNICIAN", channels: ["IN_APP", "SMS"], subject: "Visit cancelled", body: "The visit for {{customer}} on {{when}} was cancelled. Reason: {{reason}}" },
  { event: "follow_up.required", audience: "TECHNICIAN", channels: ["IN_APP"], subject: "Follow-up visit required", body: "The job for {{customer}} needs another visit." },
  // Operations
  { event: "request.new", audience: "OPS", channels: ["IN_APP"], subject: "New service request", body: "{{customer}} reported a problem with {{equipment}}." },
  { event: "assignment.declined", audience: "OPS", channels: ["IN_APP", "EMAIL"], subject: "Technician declined a job", body: "{{technician}} declined the job for {{customer}}. Reason: {{reason}}" },
  { event: "job.delayed", audience: "OPS", channels: ["IN_APP", "EMAIL"], subject: "Job delayed", body: "The visit for {{customer}} planned at {{when}} has not started." },
  { event: "part.unavailable", audience: "OPS", channels: ["IN_APP", "EMAIL"], subject: "Part unavailable", body: "{{technician}} needs {{parts}} for {{customer}}." },
  { event: "job.another_visit", audience: "OPS", channels: ["IN_APP"], subject: "Job requires another visit", body: "The job for {{customer}} could not finish: {{reason}}" },
  { event: "contract.expiring", audience: "OPS", channels: ["IN_APP", "EMAIL"], subject: "Contract approaching expiration", body: "{{contract}} for {{customer}} ends on {{when}}." },
  { event: "inventory.low", audience: "OPS", channels: ["IN_APP", "EMAIL"], subject: "Low inventory", body: "{{part}} at {{location}} is down to {{available}}." },
];

export type NotificationEvent = (typeof notificationCatalog)[number]["event"];

export function render(template: string, vars: Record<string, string | number | undefined | null>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null || value === "" ? "—" : String(value);
  });
}
