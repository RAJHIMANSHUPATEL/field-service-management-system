import type { Request, Response } from "express";
import { addLineSchema, creditNoteSchema, listInvoicesQuerySchema, paymentOptionsSchema, recordPaymentSchema, refundSchema, updateInvoiceSchema, voidInvoiceSchema } from "./invoice.schema.js";
import { invoicePdf } from "./invoice.pdf.js";
import * as invoiceService from "./invoice.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

const id = (req: Request) => String(req.params.id);

export async function list(req: Request, res: Response) {
  res.status(200).json(await invoiceService.listInvoices(actor(req), listInvoicesQuerySchema.parse(req.query)));
}

export async function paymentOptions(_req: Request, res: Response) {
  const { data } = invoiceService.paymentOptions();
  res.status(200).json({ data: paymentOptionsSchema.parse(data) });
}

export async function get(req: Request, res: Response) {
  res.status(200).json(await invoiceService.getInvoice(id(req), actor(req)));
}

export async function update(req: Request, res: Response) {
  res.status(200).json(await invoiceService.updateInvoice(id(req), actor(req), updateInvoiceSchema.parse(req.body)));
}

export async function addLine(req: Request, res: Response) {
  res.status(201).json(await invoiceService.addLine(id(req), actor(req), addLineSchema.parse(req.body)));
}

export async function issue(req: Request, res: Response) {
  res.status(200).json(await invoiceService.issueInvoice(id(req), actor(req)));
}

export async function recordPayment(req: Request, res: Response) {
  res.status(201).json(await invoiceService.recordPayment(id(req), actor(req), recordPaymentSchema.parse(req.body)));
}

export async function pay(req: Request, res: Response) {
  res.status(201).json(await invoiceService.payOnline(id(req), actor(req)));
}

export async function voidInvoice(req: Request, res: Response) {
  res.status(200).json(await invoiceService.voidInvoice(id(req), actor(req), voidInvoiceSchema.parse(req.body).reason));
}

export async function markOverdue(req: Request, res: Response) {
  res.status(200).json({ data: { marked: await invoiceService.markOverdue(actor(req).organizationId) } });
}

export async function pdf(req: Request, res: Response) {
  const { pdf: body, number } = await invoicePdf(id(req), actor(req));
  res.status(200).type("application/pdf").setHeader("Content-Disposition", `inline; filename="invoice-${number}.pdf"`);
  res.end(body);
}

export async function creditNote(req: Request, res: Response) {
  const input = creditNoteSchema.parse(req.body);
  res.status(201).json(await invoiceService.issueCreditNote(id(req), actor(req), input));
}

export async function refund(req: Request, res: Response) {
  const input = refundSchema.parse(req.body);
  res.status(201).json(await invoiceService.issueRefund(id(req), actor(req), input));
}
