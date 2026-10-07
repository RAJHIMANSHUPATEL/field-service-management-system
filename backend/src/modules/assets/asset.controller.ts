import type { Request, Response } from "express";
import { createAssetSchema, listAssetsQuerySchema, updateAssetSchema } from "./asset.schema.js";
import * as assetService from "./asset.service.js";

function actor(req: Request) {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  return req.user;
}

export async function list(req: Request, res: Response) {
  const query = listAssetsQuerySchema.parse(req.query);
  const result = await assetService.listAssets(actor(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response) {
  const result = await assetService.getAsset(String(req.params.id), actor(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response) {
  const body = createAssetSchema.parse(req.body);
  const result = await assetService.createAsset(body, actor(req));
  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const body = updateAssetSchema.parse(req.body);
  const result = await assetService.updateAsset(String(req.params.id), body, actor(req));
  res.status(200).json(result);
}
