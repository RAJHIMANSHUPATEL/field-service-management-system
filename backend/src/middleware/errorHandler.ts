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

  console.error(err);
  // #region agent log
  {
    const prismaError = err as { code?: string; message?: string };
    fetch("http://127.0.0.1:7863/ingest/c073d103-8592-493c-b7ab-4f798c5dd065", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "93e68e" },
      body: JSON.stringify({
        sessionId: "93e68e",
        runId: "pre-fix",
        hypothesisId: "A-D",
        location: "errorHandler.ts:unhandled",
        message: "Unhandled API error",
        data: {
          code: prismaError.code ?? null,
          isDatabaseAuthFailure: prismaError.code === "P1000",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    },
  });
}
