import type { Request, Response } from "express";
import {
  createAddressSchema,
  createContactSchema,
  createCustomerSchema,
  listCustomersQuerySchema,
  updateAddressSchema,
  updateContactSchema,
  updateCustomerSchema,
} from "./customer.schema.js";
import * as customerService from "./customer.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listCustomersQuerySchema.parse(req.query);
  const result = await customerService.listCustomers(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await customerService.getCustomer(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response) {
  const body = createCustomerSchema.parse(req.body);
  const result = await customerService.createCustomer(body, actor(req));
  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const body = updateCustomerSchema.parse(req.body);
  const result = await customerService.updateCustomer(String(req.params.id), body, actor(req));
  res.status(200).json(result);
}

export async function createContact(req: Request, res: Response) {
  const body = createContactSchema.parse(req.body);
  const result = await customerService.createContact(String(req.params.id), body, actor(req));
  res.status(201).json(result);
}

export async function updateContact(req: Request, res: Response) {
  const body = updateContactSchema.parse(req.body);
  const result = await customerService.updateContact(
    String(req.params.customerId),
    String(req.params.contactId),
    body,
    actor(req),
  );
  res.status(200).json(result);
}

export async function createAddress(req: Request, res: Response) {
  const body = createAddressSchema.parse(req.body);
  const result = await customerService.createAddress(String(req.params.id), body, actor(req));
  res.status(201).json(result);
}

export async function updateAddress(req: Request, res: Response) {
  const body = updateAddressSchema.parse(req.body);
  const result = await customerService.updateAddress(
    String(req.params.customerId),
    String(req.params.addressId),
    body,
    actor(req),
  );
  res.status(200).json(result);
}
