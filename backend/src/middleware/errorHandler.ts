import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: err.issues,
      },
    });
    return;
  }

  const httpError = err as { type?: string; status?: number };
  if (httpError.type === "entity.too.large") {
    res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "The request body is too large" } });
    return;
  }
  if (httpError.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body" } });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    },
  });
}
