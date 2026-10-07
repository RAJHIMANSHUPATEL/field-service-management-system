import type { Request, Response } from "express";
import { cancelContractSchema, createContractSchema, listContractsQuerySchema } from "./contract.schema.js";
import * as contractService from "./contract.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  res.status(200).json(await contractService.listContracts(actor(req), listContractsQuerySchema.parse(req.query).customerId));
}

export async function get(req: Request, res: Response) {
  res.status(200).json(await contractService.getContract(String(req.params.id), actor(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await contractService.createContract(actor(req), createContractSchema.parse(req.body)));
}

export async function cancel(req: Request, res: Response) {
  cancelContractSchema.parse(req.body);
  res.status(200).json(await contractService.cancelContract(String(req.params.id), actor(req)));
}
