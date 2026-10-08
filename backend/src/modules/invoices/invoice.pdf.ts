import PDFDocument from "pdfkit";
import { gstStateByCode } from "../../lib/gstStates.js";
import type { AuthUser } from "../../types/authUser.js";
import { invoiceForPdf } from "./invoice.service.js";

type Stored = Awaited<ReturnType<typeof invoiceForPdf>>;
type Amount = { toString(): string } | string | number;

// The built-in PDF fonts have no rupee glyph, so amounts read "INR 2,183.00" with Indian grouping.
const grouping = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inr = (value: Amount) => grouping.format(Number(value.toString()));
const rupees = (value: Amount) => `INR ${inr(value)}`;
// Dates on the Indian calendar day, as "04 Sep 2026" (ICU's en-IN short month for September is "Sept").
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const istParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "2-digit" });
const day = (value: Date | null) => {
  if (!value) return "—";
  const parts = Object.fromEntries(istParts.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.day} ${months[Number(parts.month) - 1]} ${parts.year}`;
};
const isZero = (value: Amount) => Number(value.toString()) === 0;

const statusLabels: Record<string, string> = { ISSUED: "Issued", OVERDUE: "Overdue", PAID: "Paid", VOID: "Void" };
const methodLabels: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", ONLINE: "Online" };
const coverageLabels: Record<string, string> = { NONE: "Not covered", WARRANTY: "Covered by warranty", CONTRACT: "Covered by contract" };

function statusLine(invoice: Stored) {
  const paid = Number(invoice.amountPaid.toString());
  const partial = (invoice.status === "ISSUED" || invoice.status === "OVERDUE") && paid > 0;
  return `${statusLabels[invoice.status] ?? invoice.status}${partial ? " · Partially paid" : ""}`;
}

// The invoice PDF, built on request from the stored invoice so it always matches the record.
export async function invoicePdf(id: string, actor: AuthUser) {
  const invoice = await invoiceForPdf(id, actor);
  const isVoid = invoice.status === "VOID";
  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Invoice ${invoice.number ?? invoice.id}` } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => document.on("end", () => resolve(Buffer.concat(chunks))));

  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const width = right - left;
  const bottom = () => document.page.height - document.page.margins.bottom;
  const ensure = (height: number) => {
    if (document.y + height > bottom()) {
      document.addPage();
      if (isVoid) voidMark();
    }
  };
  const rule = () => {
    document.moveTo(left, document.y).lineTo(right, document.y).lineWidth(0.5).strokeColor("#bbbbbb").stroke().strokeColor("#000000");
  };
  const heading = (text: string) => {
    ensure(40);
    document.moveDown(0.9).font("Helvetica-Bold").fontSize(11).fillColor("#000").text(text, left, document.y, { width });
    document.moveDown(0.3).font("Helvetica").fontSize(9.5);
  };
  // A diagonal VOID across every page, behind nothing important and impossible to miss.
  const voidMark = () => {
    const { x, y } = document;
    document.save();
    document.rotate(-30, { origin: [document.page.width / 2, document.page.height / 2] });
    document.font("Helvetica-Bold").fontSize(120).fillColor("#d32f2f").fillOpacity(0.15);
    document.text("VOID", 0, document.page.height / 2 - 60, { width: document.page.width, align: "center", lineBreak: false });
    document.restore();
    document.fillOpacity(1).fillColor("#000");
    document.x = x;
    document.y = y;
  };
  if (isVoid) voidMark();

  // Header: who issues it on the left, the invoice identity on the right.
  const home = gstStateByCode(invoice.organization.gstState);
  const top = document.y;
  document.font("Helvetica-Bold").fontSize(20).text(isVoid ? "Tax invoice (void)" : "Tax invoice", left, top, { width: width * 0.55 });
  document.font("Helvetica").fontSize(10).fillColor("#444").text(invoice.organization.name, { width: width * 0.55 });
  if (home) document.text(`GST state: ${home.code} ${home.name}`, { width: width * 0.55 });
  const leftBottom = document.y;
  const meta: [string, string][] = [
    ["Invoice", invoice.number ?? "—"],
    ["Status", statusLine(invoice)],
    ["Issued", day(invoice.issuedAt)],
    ["Due", day(invoice.dueAt)],
    ...(invoice.paidAt ? ([["Paid", day(invoice.paidAt)]] as [string, string][]) : []),
    ...(invoice.voidedAt ? ([["Voided", day(invoice.voidedAt)]] as [string, string][]) : []),
  ];
  let metaY = top + 2;
  const metaX = left + width * 0.58;
  for (const [label, value] of meta) {
    document.font("Helvetica").fontSize(9.5).fillColor("#555").text(label, metaX, metaY, { width: 60 });
    document
      .font("Helvetica-Bold")
      .fillColor(label === "Status" && (isVoid || invoice.status === "OVERDUE") ? "#c62828" : "#000")
      .text(value, metaX + 60, metaY, { width: right - metaX - 60, align: "right" });
    metaY += 14;
  }
  document.fillColor("#000");
  document.y = Math.max(leftBottom, metaY) + 10;
  rule();

  // Bill to and the job.
  const site = [invoice.address.line1, invoice.address.line2, invoice.address.city, `${invoice.address.state} ${invoice.address.postalCode}`]
    .filter(Boolean)
    .join(", ");
  const supply = !isZero(invoice.igst) ? "Inter-state (IGST)" : !isZero(invoice.cgst) ? "Intra-state (CGST + SGST)" : "No tax charged";
  const blockTop = document.y + 10;
  const column = (x: number, w: number, title: string, rows: string[]) => {
    document.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(title.toUpperCase(), x, blockTop, { width: w });
    document.font("Helvetica").fontSize(10).fillColor("#000");
    for (const row of rows) document.text(row, x, document.y + 1, { width: w });
    return document.y;
  };
  const a = column(left, width * 0.48, "Bill to", [invoice.customer.name, `Site: ${site}`]);
  const b = column(left + width * 0.52, width * 0.48, "Job", [
    `${invoice.workOrder.serviceType.name}`,
    `${invoice.workOrder.asset.equipmentType} ${invoice.asset.model}`,
    `Serial number: ${invoice.workOrder.asset.serialNumber}`,
    `Supply: ${supply}`,
    `Coverage: ${coverageLabels[invoice.coverageSource] ?? invoice.coverageSource}${invoice.contract ? ` (${invoice.contract.name})` : ""}`,
  ]);
  document.y = Math.max(a, b) + 12;

  // Lines.
  const columns = [
    { label: "Item", x: left, w: width * 0.4, align: "left" as const },
    { label: "SAC", x: left + width * 0.4, w: width * 0.1, align: "left" as const },
    { label: "Qty", x: left + width * 0.5, w: width * 0.08, align: "right" as const },
    { label: "Rate", x: left + width * 0.58, w: width * 0.14, align: "right" as const },
    { label: "Amount", x: left + width * 0.72, w: width * 0.14, align: "right" as const },
    { label: "Covered", x: left + width * 0.86, w: width * 0.14, align: "right" as const },
  ];
  const headerRow = () => {
    const y = document.y;
    document.rect(left, y - 3, width, 18).fill("#f1f3f4").fillColor("#555");
    document.font("Helvetica-Bold").fontSize(8.5);
    for (const col of columns) document.text(col.label.toUpperCase(), col.x + 2, y + 2, { width: col.w - 4, align: col.align });
    document.fillColor("#000");
    document.y = y + 20;
  };
  headerRow();
  document.font("Helvetica").fontSize(9.5);
  for (const line of invoice.lines) {
    const height = Math.max(14, document.heightOfString(line.description, { width: columns[0]!.w - 12 })) + 6;
    if (document.y + height > bottom()) {
      document.addPage();
      if (isVoid) voidMark();
      headerRow();
      document.font("Helvetica").fontSize(9.5);
    }
    const y = document.y;
    const cells = [
      line.description,
      line.sacCode ?? "—",
      Number(line.quantity.toString()).toString(),
      inr(line.unitPrice),
      inr(line.amount),
      isZero(line.coveredAmount) ? "—" : `-${inr(line.coveredAmount)}`,
    ];
    cells.forEach((text, index) => {
      const col = columns[index]!;
      document.text(text, col.x + 2, y, { width: col.w - (index === 0 ? 12 : 4), align: col.align });
    });
    document.y = y + height;
    document.moveTo(left, document.y - 3).lineTo(right, document.y - 3).lineWidth(0.3).strokeColor("#e0e0e0").stroke().strokeColor("#000");
  }
  document.font("Helvetica").fontSize(8.5).fillColor("#666").text("Amounts in INR.", left, document.y + 2, { width });
  document.fillColor("#000");

  // Totals, right-aligned; zero tax components are left out, as on the invoice page.
  const halfRate = Number(invoice.taxRatePercent.toString()) / 2;
  const totals: [string, string, boolean?][] = [
    ["Subtotal", rupees(invoice.subtotal)],
    ...(!isZero(invoice.coveredTotal) ? ([["Covered", `-${rupees(invoice.coveredTotal)}`]] as [string, string][]) : []),
    ...(!isZero(invoice.discount) ? ([["Discount", `-${rupees(invoice.discount)}`]] as [string, string][]) : []),
    ["Taxable amount", rupees(invoice.taxableAmount)],
    ...(!isZero(invoice.cgst) ? ([[`CGST ${halfRate}%`, rupees(invoice.cgst)]] as [string, string][]) : []),
    ...(!isZero(invoice.sgst) ? ([[`SGST ${halfRate}%`, rupees(invoice.sgst)]] as [string, string][]) : []),
    ...(!isZero(invoice.igst) ? ([[`IGST ${halfRate * 2}%`, rupees(invoice.igst)]] as [string, string][]) : []),
    ["Total", rupees(invoice.total), true],
    ["Paid", rupees(invoice.amountPaid)],
    ["Balance", rupees(isVoid ? 0 : Number(invoice.total.toString()) - Number(invoice.amountPaid.toString())), true],
  ];
  ensure(totals.length * 15 + 20);
  document.y += 10;
  const labelX = left + width * 0.55;
  for (const [label, value, strong] of totals) {
    const y = document.y;
    document.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 10.5 : 9.5);
    document.text(label, labelX, y, { width: width * 0.22 });
    document.text(value, labelX + width * 0.2, y, { width: width * 0.25, align: "right" });
    document.y = y + (strong ? 16 : 14);
  }
  if (isVoid) {
    document.font("Helvetica-Bold").fontSize(9.5).fillColor("#c62828").text("This invoice is void and is not payable.", left, document.y + 4, { width, align: "right" });
    document.fillColor("#000");
  }

  // Payments received.
  heading("Payments");
  if (invoice.payments.length === 0) {
    document.text("No payments recorded.", left, document.y, { width });
  }
  for (const payment of invoice.payments) {
    ensure(16);
    const y = document.y;
    const reference = [methodLabels[payment.method] ?? payment.method, payment.reference].filter(Boolean).join(" · ");
    document.text(day(payment.paidAt), left, y, { width: width * 0.2 });
    document.text(reference, left + width * 0.2, y, { width: width * 0.55 });
    document.text(rupees(payment.amount), left + width * 0.75, y, { width: width * 0.25, align: "right" });
    document.y = y + 14;
  }

  if (invoice.notes) {
    heading("Notes");
    document.text(invoice.notes, left, document.y, { width });
  }

  ensure(30);
  document.moveDown(1.5).font("Helvetica").fontSize(8).fillColor("#777").text("This is a computer-generated invoice.", left, document.y, { width, align: "center" });
  document.end();
  return { pdf: await done, number: invoice.number ?? invoice.id };
}
