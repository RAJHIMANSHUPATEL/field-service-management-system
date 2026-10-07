import PDFDocument from "pdfkit";
import type { AuthUser } from "../../types/authUser.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getObjectBytes } from "../../lib/storage.js";

function when(value: Date | null) {
  return value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : "—";
}

// Who may read the report: org staff, the assigned technician, and the job's customer.
async function requireReportable(id: string, actor: AuthUser) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      organization: { select: { name: true } },
      customer: { select: { id: true, name: true } },
      asset: true,
      address: true,
      serviceType: { select: { name: true } },
      technician: { select: { userId: true, user: { select: { name: true } } } },
      notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      visits: {
        orderBy: { createdAt: "asc" },
        where: { status: { in: ["COMPLETED", "UNSUCCESSFUL"] } },
        include: {
          technician: { select: { user: { select: { name: true } } } },
          parts: { where: { status: "CONSUMED" }, include: { part: true } },
          photos: { select: { id: true } },
        },
      },
    },
  });
  if (!workOrder) {
    throw new AppError("WORK_ORDER_NOT_FOUND", 404, "Work order not found");
  }
  if (actor.role === "TECHNICIAN" && workOrder.technician?.userId !== actor.id) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
  }
  if (actor.role === "CUSTOMER") {
    const contact = await prisma.customerContact.findFirst({ where: { userId: actor.id } });
    if (!contact || contact.customerId !== workOrder.customerId) {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this resource");
    }
  }
  if (workOrder.status !== "COMPLETED") {
    throw new AppError("REPORT_NOT_READY", 409, "The service report is available once the job is completed");
  }
  return workOrder;
}

// The service report, generated on request from the visit data so it always matches the record.
export async function serviceReportPdf(id: string, actor: AuthUser) {
  const workOrder = await requireReportable(id, actor);
  const signatures = await Promise.all(
    workOrder.visits.map((visit) => (visit.signatureKey ? getObjectBytes(visit.signatureKey) : Promise.resolve(null))),
  );

  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Service report ${workOrder.id}` } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => document.on("end", () => resolve(Buffer.concat(chunks))));

  const heading = (text: string) => document.moveDown(0.8).font("Helvetica-Bold").fontSize(12).text(text).font("Helvetica").fontSize(10);
  const field = (label: string, value: string) =>
    document.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);

  document.font("Helvetica-Bold").fontSize(18).text("Service report");
  document.font("Helvetica").fontSize(10).fillColor("#555").text(workOrder.organization.name).fillColor("#000");
  heading("Job");
  field("Work order", workOrder.id);
  field("Customer", workOrder.customer.name);
  field("Site", `${workOrder.address.line1}, ${workOrder.address.city}, ${workOrder.address.state} ${workOrder.address.postalCode}`);
  field("Equipment", `${workOrder.asset.equipmentType} ${workOrder.asset.model} · S/N ${workOrder.asset.serialNumber}`);
  field("Service", workOrder.serviceType.name);
  field("Problem reported", workOrder.description);

  workOrder.visits.forEach((visit, index) => {
    heading(`Visit ${index + 1} · ${visit.status === "COMPLETED" ? "Completed" : "Could not finish"}`);
    field("Technician", visit.technician.user.name);
    field("Arrived", when(visit.arrivedAt));
    field("Work started", when(visit.startedAt));
    field(visit.status === "COMPLETED" ? "Completed" : "Ended", when(visit.completedAt ?? visit.endedAt));
    if (visit.outcomeReason) {
      field("Why it could not finish", visit.outcomeReason);
    }
    field("Diagnosis", visit.diagnosis ?? "—");
    field("Work performed", visit.workPerformed ?? "—");
    field("Photos on file", String(visit.photos.length));
    if (visit.parts.length > 0) {
      document.font("Helvetica-Bold").text("Parts used:").font("Helvetica");
      for (const row of visit.parts) {
        document.text(`  ${row.quantity} × ${row.part.name} (${row.part.sku})`);
      }
    }
    const signature = signatures[index];
    if (visit.signerName) {
      field("Signed by", `${visit.signerName} at ${when(visit.signedAt)}`);
      if (signature) {
        document.image(signature, { fit: [180, 60] });
      }
    }
  });

  if (workOrder.notes.length > 0) {
    heading("Notes");
    for (const note of workOrder.notes) {
      document.text(`${note.author.name}: ${note.body}`);
    }
  }
  document.end();
  return done;
}
